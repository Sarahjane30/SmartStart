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
