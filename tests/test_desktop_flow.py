from ira import desktop_flow as df


def _ctx():
    return {"employee": {"name": "Erica Mcclain", "manager_name": "Priya Singh"}, "profile": {"onboarded": False}}


def test_get_to_know_me_in_chat_saves_answers():
    ctx = _ctx()
    flow = df.DesktopConversation()
    intro = flow.intro(ctx)
    assert intro and df.YES_START in intro.chips
    assert flow.intro(ctx) is None

    turn = flow.handle(df.YES_START, ctx, online=True, history=[])
    assert "first internship" in turn.reply and df.SKIP in turn.chips
    for answer in ("Yes, it's my first", df.SKIP, "Still learning", "Getting there"):
        turn = flow.handle(answer, ctx, online=True, history=[])
    assert "learning something new" in turn.reply and df.DONE in turn.chips
    turn = flow.handle("Show me", ctx, online=True, history=[])
    assert turn.reply.startswith("Got it: Show me")
    turn = flow.handle("practice with me", ctx, online=True, history=[])
    turn = flow.handle(df.DONE, ctx, online=True, history=[])
    turn = flow.handle("banana", ctx, online=True, history=[])
    assert turn.reply.startswith("I didn't quite catch that")
    turn = flow.handle("Keep it short", ctx, online=True, history=[])
    for answer in (df.DONE, "Nothing — I'm ready", df.SKIP):
        turn = flow.handle(answer, ctx, online=True, history=[])
    assert turn.save_answers == {
        "first_job": "yes", "comm_comfort": "low", "tech_comfort": "ok",
        "learn": ["show", "practice"], "style": ["short"], "nervous": ["ready"],
    }
    assert turn.reply.startswith("Thanks, Erica!")
    assert ctx["profile"]["onboarded"] is True


def test_maybe_later_and_practice_mode():
    ctx = _ctx()
    flow = df.DesktopConversation()
    flow.intro(ctx)
    assert "whenever you like" in flow.handle(df.LATER, ctx, online=True, history=[]).reply
    start = flow.handle("Practice: Tell your manager you're stuck", ctx, online=True, history=[])
    assert "Practice mode" in start.reply and flow.coach
    fb = flow.handle("Hi Priya, I'm stuck on Jira access. Could we take 10 minutes today?", ctx, online=True, history=[])
    assert "What have you tried so far?" in fb.reply and "tell your manager what you've already tried" in fb.reply
    assert df.TRY_AGAIN in fb.chips
    end = flow.handle(df.END_PRACTICE, ctx, online=True, history=[])
    assert flow.coach is None and "Nice work" in end.reply


def test_ticket_questions_get_the_same_draft_card_as_the_website():
    ctx = {**_ctx(), "profile": {"onboarded": True}}
    flow = df.DesktopConversation()
    turn = flow.handle("My laptop keyboard is not working, how do I raise a ticket?", ctx, online=True, history=[])
    assert turn.ticket and turn.ticket["item_id"] == "hardware-software"
    assert "IT Service Portal" in turn.reply and "?from=ira" in turn.ticket["form_url"]
    jira = flow.handle("how to raise ticket for jira", ctx, online=True, history=[])
    assert jira.ticket["item_id"] == "access" and "Jira work item" in jira.reply
    assert flow.handle("Who is my manager?", ctx, online=True, history=[]).ticket is None
