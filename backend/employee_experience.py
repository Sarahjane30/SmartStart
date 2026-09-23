"""Layer 3 — synthetic employee learning tracks, notifications, feedback."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from backend.database import DataStore, store
from backend.models import (
    ONBOARDING_STAGES,
    ConsultContact,
    DepartmentTrack,
    EmployeeNotification,
    EmployeeProfile,
    FeedbackCreate,
    FeedbackRecord,
    FeedbackResponse,
    KnowledgeCheck,
    LearningModule,
    LearningModuleDetail,
    LearningResource,
    LearningTrackResponse,
    LessonStep,
    ModuleStatus,
    NotificationKind,
    NotificationsResponse,
    OnboardingState,
    RoleType,
    TeamMember,
    TeamWorkspaceResponse,
)
from backend.synthetic_engine import days_in_pipeline, infer_bottleneck
from backend.learning_content import content_for
from backend.team_directory import build_colleagues, work_email

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)

# In-memory synthetic feedback ledger (cleared on cohort regenerate).
_FEEDBACK: list[FeedbackRecord] = []
# joiner_id -> module suffixes the joiner finished in the Learning tab.
_COMPLETED: dict[str, set[str]] = {}


def clear_feedback() -> None:
    _FEEDBACK.clear()
    _COMPLETED.clear()


def list_feedback(joiner_id: str | None = None) -> list[FeedbackRecord]:
    if joiner_id is None:
        return list(_FEEDBACK)
    return [f for f in _FEEDBACK if f.joiner_id == joiner_id]


def _stage_index(state: OnboardingState) -> int:
    return ONBOARDING_STAGES.index(state)


def _stable_int(seed: str, mod: int) -> int:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % mod


def _next_action(state: OnboardingState, role_type: RoleType) -> str:
    mapping = {
        OnboardingState.OFFER_ACCEPTED: "Upload your onboarding document packet in iCIMS.",
        OnboardingState.DOCS_SUBMITTED: "Wait for IT laptop provisioning, then accept Okta invite.",
        OnboardingState.IT_PROVISIONED: "Confirm Day-1 orientation calendar invite.",
        OnboardingState.DAY1_ORIENTED: (
            "Meet your mentor and complete first learning modules."
            if role_type == RoleType.INTERN
            else "Complete department readiness tasks and request project assignment."
        ),
        OnboardingState.PROJECT_READY: "You're project-ready — review week-1 checklist with your manager.",
    }
    return mapping[state]


def build_employee_profile(joiner_id: str, db: DataStore | None = None) -> EmployeeProfile:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        raise KeyError(joiner_id)
    docs = db.get_documents(joiner_id)
    ticket = db.get_ticket_for_joiner(joiner_id)
    if docs is None or ticket is None:
        raise KeyError(f"incomplete bundle for {joiner_id}")

    return EmployeeProfile(
        id=joiner.id,
        name=joiner.name,
        email=joiner.email,
        role_type=joiner.role_type,
        department=joiner.department,
        department_track=joiner.department_track,
        joining_date=joiner.joining_date,
        current_state=joiner.current_state,
        mentor_name=joiner.mentor_name,
        learning_track=joiner.learning_track,
        assigned_tasks=joiner.assigned_tasks,
        days_in_pipeline=days_in_pipeline(joiner, now=AS_OF),
        docs_status=docs.status,
        hardware_status=ticket.hardware_status,
        software_access=ticket.software_access,
        bottleneck=infer_bottleneck(joiner.current_state, docs, ticket),
        next_action=_next_action(joiner.current_state, joiner.role_type),
        synthetic=True,
    )


def _module_catalog(role_type: RoleType, track: DepartmentTrack) -> list[tuple[str, str, str, int, str]]:
    """Return (id_suffix, title, description, minutes, category) templates."""
    shared = [
        ("welcome", "Welcome to SmartStart", "Company overview, values, and first-week map.", 20, "Orientation"),
        ("security", "Security & compliance basics", "Password hygiene, phishing, and data handling.", 30, "Compliance"),
        ("tools", "Core tools setup", "Okta, Slack, email, and calendar essentials.", 25, "IT"),
    ]

    if role_type == RoleType.INTERN:
        role_mods = [
            ("mentor", "Meet your mentor", "Schedule intro chat and set weekly check-ins.", 15, "Mentorship"),
            ("git", "Git Basics", "Clone, commit, branch, and open a practice PR.", 45, "Engineering Foundations"),
            ("comm", "Intern communication lab", "Standups, async updates, and asking for help.", 30, "Mentorship"),
            ("shadow", "Shadow a sprint ritual", "Observe planning/retro with your pod.", 40, "Team"),
        ]
        if track == DepartmentTrack.NON_TECHNICAL:
            role_mods = [
                ("mentor", "Meet your mentor", "Schedule intro chat and set weekly check-ins.", 15, "Mentorship"),
                ("crm", "CRM navigation 101", "Find accounts, notes, and pipeline stages.", 35, "Business Foundations"),
                ("comm", "Intern communication lab", "Standups, async updates, and asking for help.", 30, "Mentorship"),
                ("shadow", "Shadow a customer touchpoint", "Observe a call or campaign review.", 40, "Team"),
            ]
    else:
        # FTE — department-specific + project readiness
        if track == DepartmentTrack.TECHNICAL:
            role_mods = [
                ("arch", "Department architecture overview", "Systems map and ownership boundaries.", 40, "Department"),
                ("env", "Dev environment deep dive", "Local stack, secrets, and first deploy path.", 50, "Engineering"),
                ("ready", "Project readiness checklist", "Definition of ready, ticket hygiene, SLAs.", 35, "Project Readiness"),
                ("oncall", "Support & escalation paths", "Who to page, when, and how to document.", 25, "Project Readiness"),
            ]
        else:
            role_mods = [
                ("proc", "Department process playbook", "Approvals, SLAs, and handoffs.", 35, "Department"),
                ("systems", "Business systems tour", "Workday, Salesforce, and reporting basics.", 40, "Department"),
                ("ready", "Project readiness checklist", "Stakeholders, success metrics, kickoff agenda.", 35, "Project Readiness"),
                ("stake", "Stakeholder mapping", "Identify partners and decision owners.", 30, "Project Readiness"),
            ]

    return shared + role_mods


def _status_for_module(index: int, stage_i: int, total: int) -> ModuleStatus:
    # Map onboarding stage progress onto module unlock/completion.
    # More advanced stages unlock/complete more modules.
    unlocked = min(total, max(1, stage_i + 2))
    completed = min(total, max(0, stage_i))
    if index < completed:
        return ModuleStatus.COMPLETE
    if index < unlocked:
        return ModuleStatus.IN_PROGRESS if index == completed else ModuleStatus.AVAILABLE
    return ModuleStatus.LOCKED


def build_learning_track(joiner_id: str, db: DataStore | None = None) -> LearningTrackResponse:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        raise KeyError(joiner_id)

    catalog = _module_catalog(joiner.role_type, joiner.department_track)
    stage_i = _stage_index(joiner.current_state)
    done = _COMPLETED.get(joiner_id, set())
    modules: list[LearningModule] = []
    for idx, (suffix, title, description, minutes, category) in enumerate(catalog):
        status = _status_for_module(idx, stage_i, len(catalog))
        if suffix in done:
            status = ModuleStatus.COMPLETE
        elif (
            done
            and status == ModuleStatus.LOCKED
            and modules
            and modules[-1].status == ModuleStatus.COMPLETE
        ):
            status = ModuleStatus.AVAILABLE
        modules.append(
            LearningModule(
                id=f"{joiner_id}-MOD-{suffix}",
                title=title,
                description=description,
                duration_minutes=minutes,
                status=status,
                category=category,
                required=True,
                synthetic=True,
            )
        )

    completed = sum(1 for m in modules if m.status == ModuleStatus.COMPLETE)
    total = len(modules)
    return LearningTrackResponse(
        joiner_id=joiner_id,
        track_name=joiner.learning_track,
        role_type=joiner.role_type,
        department_track=joiner.department_track,
        modules=modules,
        completion_pct=round(100.0 * completed / max(total, 1), 1),
        completed_count=completed,
        total_count=total,
        synthetic=True,
    )


def _module_suffix(joiner_id: str, module_id: str) -> str:
    prefix = f"{joiner_id}-MOD-"
    return module_id[len(prefix):] if module_id.startswith(prefix) else module_id


def build_module_detail(
    joiner_id: str, module_id: str, db: DataStore | None = None
) -> LearningModuleDetail:
    track = build_learning_track(joiner_id, db=db)
    suffix = _module_suffix(joiner_id, module_id)
    idx = next(
        (i for i, m in enumerate(track.modules) if _module_suffix(joiner_id, m.id) == suffix),
        None,
    )
    if idx is None:
        raise KeyError(module_id)
    module = track.modules[idx]
    content = content_for(suffix) or {}
    check = content.get("check")
    unlock_hint = ""
    if module.status == ModuleStatus.LOCKED:
        prev = track.modules[idx - 1].title if idx else "earlier onboarding steps"
        unlock_hint = f"Unlocks after you finish “{prev}”. You can preview the material now."
    return LearningModuleDetail(
        module=module,
        summary=content.get("summary", module.description),
        lessons=[LessonStep(title=t, body=b) for t, b in content.get("lessons", [])],
        takeaways=list(content.get("takeaways", [])),
        resources=[LearningResource(**r) for r in content.get("resources", [])],
        check=KnowledgeCheck(**check) if check else None,
        ask_ira=list(content.get("ask_ira", [])),
        unlock_hint=unlock_hint,
    )


def complete_module(
    joiner_id: str, module_id: str, db: DataStore | None = None
) -> LearningTrackResponse:
    track = build_learning_track(joiner_id, db=db)
    suffix = _module_suffix(joiner_id, module_id)
    module = next(
        (m for m in track.modules if _module_suffix(joiner_id, m.id) == suffix), None
    )
    if module is None:
        raise KeyError(module_id)
    if module.status == ModuleStatus.LOCKED:
        raise ValueError("Module is locked — finish the previous module first.")
    _COMPLETED.setdefault(joiner_id, set()).add(suffix)
    return build_learning_track(joiner_id, db=db)


def build_notifications(joiner_id: str, db: DataStore | None = None) -> NotificationsResponse:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        raise KeyError(joiner_id)
    docs = db.get_documents(joiner_id)
    ticket = db.get_ticket_for_joiner(joiner_id)
    if docs is None or ticket is None:
        raise KeyError(f"incomplete bundle for {joiner_id}")

    notes: list[EmployeeNotification] = []
    base = AS_OF

    notes.append(
        EmployeeNotification(
            id=f"{joiner_id}-N-welcome",
            kind=NotificationKind.INFO,
            title="Welcome aboard",
            message=f"Hi {joiner.name.split()[0]} — your synthetic SmartStart workspace is ready.",
            created_at=base - timedelta(days=max(days_in_pipeline(joiner, now=AS_OF), 1)),
            read=True,
            synthetic=True,
        )
    )

    if docs.status.value == "Pending":
        notes.append(
            EmployeeNotification(
                id=f"{joiner_id}-N-docs",
                kind=NotificationKind.ACTION,
                title="Document packet still open",
                message="Finish your iCIMS forms today to unblock IT provisioning.",
                created_at=base - timedelta(hours=18),
                read=False,
                synthetic=True,
            )
        )
    else:
        notes.append(
            EmployeeNotification(
                id=f"{joiner_id}-N-docs-done",
                kind=NotificationKind.SUCCESS,
                title="Documents accepted",
                message="Your onboarding packet is marked complete (synthetic).",
                created_at=base - timedelta(days=2),
                read=True,
                synthetic=True,
            )
        )

    if ticket.hardware_status.value == "Delivered":
        notes.append(
            EmployeeNotification(
                id=f"{joiner_id}-N-laptop",
                kind=NotificationKind.SUCCESS,
                title="Laptop delivered",
                message="ServiceNow shows your hardware as Delivered. VPN access is approved.",
                created_at=base - timedelta(days=1, hours=4),
                read=False,
                synthetic=True,
            )
        )
        if "VPN" in ticket.software_access or "Okta" in ticket.software_access:
            notes.append(
                EmployeeNotification(
                    id=f"{joiner_id}-N-vpn",
                    kind=NotificationKind.SUCCESS,
                    title="VPN approved",
                    message="Your VPN profile is ready — connect before Day-1 orientation.",
                    created_at=base - timedelta(hours=10),
                    read=False,
                    synthetic=True,
                )
            )
    elif ticket.sla_breached:
        notes.append(
            EmployeeNotification(
                id=f"{joiner_id}-N-it-delay",
                kind=NotificationKind.REMINDER,
                title="IT provisioning delayed",
                message=f"Ticket {ticket.ticket_id} is past SLA — IT is still configuring your kit.",
                created_at=base - timedelta(hours=6),
                read=False,
                synthetic=True,
            )
        )
    else:
        notes.append(
            EmployeeNotification(
                id=f"{joiner_id}-N-it-wait",
                kind=NotificationKind.INFO,
                title="Laptop in progress",
                message=f"Hardware status: {ticket.hardware_status.value}. We'll notify you when it's ready.",
                created_at=base - timedelta(hours=8),
                read=True,
                synthetic=True,
            )
        )

    # Role-specific nudges
    if joiner.role_type == RoleType.INTERN:
        notes.append(
            EmployeeNotification(
                id=f"{joiner_id}-N-git",
                kind=NotificationKind.REMINDER,
                title="Finish Git Basics today",
                message=f"Your mentor {joiner.mentor_name} expects the Git Basics module before Friday.",
                created_at=base - timedelta(hours=3),
                read=False,
                synthetic=True,
            )
        )
    else:
        notes.append(
            EmployeeNotification(
                id=f"{joiner_id}-N-ready",
                kind=NotificationKind.ACTION,
                title="Project readiness tasks",
                message="Complete your department readiness checklist to unlock project assignment.",
                created_at=base - timedelta(hours=5),
                read=False,
                synthetic=True,
            )
        )

    if joiner.assigned_tasks:
        task = joiner.assigned_tasks[0]
        notes.append(
            EmployeeNotification(
                id=f"{joiner_id}-N-task",
                kind=NotificationKind.ACTION,
                title="Jira task waiting",
                message=f"Assigned: {task}",
                created_at=base - timedelta(hours=2),
                read=False,
                synthetic=True,
            )
        )

    notes.sort(key=lambda n: n.created_at, reverse=True)
    unread = sum(1 for n in notes if not n.read)
    return NotificationsResponse(
        joiner_id=joiner_id,
        notifications=notes,
        unread_count=unread,
        synthetic=True,
    )


def submit_feedback(payload: FeedbackCreate) -> FeedbackResponse:
    if store.get_joiner(payload.joiner_id) is None:
        raise KeyError(payload.joiner_id)
    seq = len(_FEEDBACK) + 1
    record = FeedbackRecord(
        id=f"SYN-FB-{seq:04d}",
        joiner_id=payload.joiner_id,
        step=payload.step,
        rating=payload.rating,
        comment=payload.comment,
        tags=[t.strip() for t in payload.tags if t.strip()],
        anonymous=payload.anonymous,
        submitted_at=datetime.now(timezone.utc),
        synthetic=True,
    )
    _FEEDBACK.append(record)
    return FeedbackResponse(feedback=record, synthetic=True)


def build_team_workspace(joiner_id: str, db: DataStore | None = None) -> TeamWorkspaceResponse:
    """Synthetic consult network + department team roster for the employee UI."""
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        raise KeyError(joiner_id)

    is_intern = joiner.role_type == RoleType.INTERN
    hr_names = ("Avery Quinn", "Jordan Blake", "Riley Chen")
    it_names = ("Sam Ortiz", "Casey Nguyen", "Morgan Ellis")
    mgr_names = ("Taylor Brooks", "Jamie Patel", "Alex Rivera")

    hr = hr_names[_stable_int(joiner_id + ":hr", len(hr_names))]
    it = it_names[_stable_int(joiner_id + ":it", len(it_names))]
    mgr = joiner.manager_name or mgr_names[_stable_int(joiner_id + ":mgr", len(mgr_names))]

    consult = [
        ConsultContact(
            id=f"{joiner_id}-C-mentor",
            name=joiner.mentor_name,
            role_label="Mentor" if is_intern else "Onboarding buddy",
            channel="Slack DM · weekly 1:1",
            availability="Office hours Tue/Thu 2–3pm (synthetic)",
            focus=(
                "Learning modules, Git Basics, asking for help"
                if is_intern
                else "Department norms, project readiness, stakeholders"
            ),
            email=work_email(joiner.mentor_name),
            synthetic=True,
        ),
        ConsultContact(
            id=f"{joiner_id}-C-hr",
            name=hr,
            role_label="HR onboarding partner",
            channel="iCIMS / email",
            availability="Same-day reply on docs questions",
            focus="Document packet, compliance forms, Day-1 checklist",
            email=work_email(hr),
            portal="icims",
            portal_label="HR portal (iCIMS)",
            synthetic=True,
        ),
        ConsultContact(
            id=f"{joiner_id}-C-it",
            name=it,
            role_label="IT provisioning",
            channel="ServiceNow ticket",
            availability="SLA target 3 business days",
            focus="Laptop, VPN, Okta, software access",
            email=work_email(it),
            portal="servicenow",
            portal_label="IT portal (ServiceNow)",
            synthetic=True,
        ),
        ConsultContact(
            id=f"{joiner_id}-C-mgr",
            name=mgr,
            role_label="Hiring manager",
            channel="Calendar / Slack",
            availability="Kickoff after Day-1 orientation",
            focus=(
                "Intern goals and mentor pairing"
                if is_intern
                else "Project assignment and readiness sign-off"
            ),
            email=work_email(mgr),
            portal="jira",
            portal_label="Project board (Jira)",
            synthetic=True,
        ),
    ]

    peers = [j for j in db.list_joiners() if j.department == joiner.department]
    peers.sort(key=lambda j: (j.id != joiner_id, j.name))
    team = [
        TeamMember(
            id=j.id,
            name=j.name,
            role_type=j.role_type,
            current_state=j.current_state,
            mentor_name=j.mentor_name,
            days_in_pipeline=days_in_pipeline(j, now=AS_OF),
            is_self=j.id == joiner_id,
            synthetic=True,
        )
        for j in peers
    ]

    if is_intern:
        suggested = [
            "What can IRA help with?",
            "Which apps should I use?",
            "Who is my mentor?",
            "How do I finish Git Basics?",
            "What happens on Day 1?",
        ]
    else:
        suggested = [
            "What can IRA help with?",
            "Where do I find department processes?",
            "Which apps should I use?",
            "When will my laptop arrive?",
            "How does IRA stay governed?",
        ]

    team_name, members = build_colleagues(
        joiner_id=joiner_id,
        joiner_name=joiner.name,
        role_type=joiner.role_type,
        department=joiner.department,
        manager_name=mgr,
        mentor_name=joiner.mentor_name,
    )

    return TeamWorkspaceResponse(
        joiner_id=joiner_id,
        role_type=joiner.role_type,
        department=joiner.department,
        team_name=team_name,
        consult=consult,
        team=team,
        members=members,
        suggested_questions=suggested,
        synthetic=True,
    )
