# Mock IT Help portal — employee self-service

A **separate website** from SmartStart that replicates the look and flow of an employee
IT service portal: report something broken, request access or hardware, and track your own tickets.

This is the **employee-facing** side of IT support. It is different from the mock ServiceNow app on
port `8200`, which is the IT agents' back office and stays off-limits to employees.

| App | Port | Who uses it |
|-----|------|-------------|
| SmartStart | `8000` | Joiners, managers, HR |
| Mock iCIMS | `8100` | HR / Talent Acquisition |
| Mock ServiceNow | `8200` | IT agents (back office) |
| Mock Jira | `8300` | Boards / assigned work |
| **IT Help portal (this app)** | `8400` | Employees raising their own tickets |

## Quick start

```bash
python3 -m pip install -e ".[dev]"
python3 -m uvicorn ithelp.backend.main:app --reload --port 8400
```

Open **http://127.0.0.1:8400/** and choose **Continue with single sign-on**, or sign in with:

| Username | Password |
|----------|----------|
| `sarah.jane` | `ithelp-demo-2026` |
| `alex.example` | `ithelp-demo-2026` |

## How IRA uses it

When a joiner asks IRA in SmartStart how to raise a ticket, IRA works out which form fits
(for example *Computer Hardware or Software* or *Networking / Connectivity*) and drafts every field.
The chat card links to `http://127.0.0.1:8400/#/item/<form>?from=ira`. The joiner copies each field,
pastes it into the form, reviews it and presses **Submit** themselves. IRA never submits a ticket.

Set `SMARTSTART_ITHELP_URL` in SmartStart if the portal runs on a different address.

## Pages

- **Homepage**: greeting, search, "Report something broken/not working" tiles, My Tickets Summary, recent tickets
- **Report Something Broken / Not Working Properly**: all incident forms
- **Request New or Modified Access / Service**: access, hardware and software requests
- **Form**: contact, watch list, urgency, short description and description, with a Submit box and required-field chips
- **My tickets**, **My Favorites**, **My approvals**, **IT Service Desk Phone Numbers**

## Data

Everything is synthetic and held in memory: made-up users, `@synthetic.example` emails, placeholder
phone numbers and generated ticket numbers. Restarting the server resets the data. It is not connected
to any real ServiceNow instance or company system.

## Tests

```bash
python3 -m pytest ithelp/tests -q
```
