from ira.brain import answer, followups_for
from ira.policy_kb import answer_from_policies, load_policies


def test_policy_library_loads_all_domains():
    docs = load_policies()
    assert 10 <= len(docs) <= 15
    cats = {d.category for d in docs}
    assert {"HR", "Finance", "Legal", "Information Security"} <= cats
    assert all(d.owner and d.sections for d in docs)


def test_policy_answers_cite_source():
    cases = {
        "When will I get my salary?": "Payroll & Salary Guide",
        "What can't be reimbursed?": "Travel & Expense Policy",
        "What gifts can I accept?": "Anti-Bribery",
        "Can I use ChatGPT at work?": "Acceptable Use Policy",
        "How do I report phishing?": "Phishing",
        "What is the dress code?": "Code of Conduct",
        "How do I share files externally?": "Data Classification",
    }
    for q, title in cases.items():
        reply = answer(q, None, online=True)
        assert title in reply, (q, reply)
        assert "Source:" in reply


def test_policy_does_not_invent_personal_balances():
    reply = answer("How many leaves do I have?", None, online=True)
    assert "won’t guess" in reply or "approved source" in reply


def test_unrelated_query_has_no_policy_hit():
    assert answer_from_policies("What is my badge number?", strict=False) is None


def test_followups_are_topical_and_skip_asked():
    q = "When will I get my salary?"
    nxt = followups_for(q, "Salary is paid monthly", None, asked={q})
    assert len(nxt) == 3
    assert q not in nxt
    assert any("payslip" in s.lower() or "tax" in s.lower() for s in nxt)
