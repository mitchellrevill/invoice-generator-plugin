# Known Clients — Address Book

When a user refers to a client by short name, nickname, or partial match, look up full details here and auto-fill all available fields without asking the user to repeat them.

---

## Default Sender — Bill From (ALWAYS use this)

**Populate ALL `from*` fields with these values on every invoice unless the user explicitly names a different sender. Never ask the user for sender details.**

| Field | Value |
|-------|-------|
| `fromName` | Jon Revill Flooring |
| `fromAddress1` | 11 Spotswood Place |
| `fromAddress2` | Gleadless Valley |
| `fromCity` | Sheffield |
| `fromPostcode` | S14 1LE |
| `fromEmail` | jonrevillflooring@btinternet.com |

> **Note:** Payment details (Virgin Money, Account: 21200470, Sort: 05-08-38, VAT Reg: 684341620) are hardcoded into both generator scripts. Do NOT include `vatRegNumber` in the invoice JSON payload.

---

## Bill To — Client Presets

Match case-insensitively and by partial name. Silently populate all available `to*` fields. Only ask for fields the preset doesn't cover and that are genuinely required. If the match is ambiguous, list the candidates and ask.

---

### Burngreave Building Co
**Aliases:** burngreave, burgreave, burngreave bld co, burngreave building
- `toName`: Burngreave Building Co
- `toAddress1`: 80 Clun Street
- `toCity`: Sheffield
- `toPostcode`: S4 7JS

---

### Mintons Carpets Ltd
**Aliases:** mintons, minton, mintons carpets, mintons carpet
- `toName`: Mintons Carpets Ltd
- `toAddress1`: The Old Dairy
- `toAddress2`: Broadfield Road
- `toCity`: Sheffield
- `toPostcode`: S8 0QX

---

### Pas Properties
**Aliases:** pas, pas properties
- `toName`: Pas Properties
- `toAddress1`: 37 Carterknowle Road
- `toCity`: Sheffield
- `toPostcode`: S7 0VV

---

### GDMA Developments
**Aliases:** gdma, gdma developments
- `toName`: GDMA Developments
- `toAddress1`: Unit 1 Callflex Business Park
- `toAddress2`: Golden Smith Lane
- `toCity`: Wath upon Dearne
- `toPostcode`: S63 7ER

---

### Ian Hodgson
**Aliases:** ian, ian hodgson, hodgson
- `toName`: Ian Hodgson
- `toAddress1`: 35 Rokeby Drive
- `toCity`: Sheffield
- `toPostcode`: S5 9JT
