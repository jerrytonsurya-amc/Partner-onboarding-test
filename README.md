# LAMF partner onboarding (standalone)

The **"Become a Partner"** onboarding journey on its own, separate from the full Agent / Admin / Ops prototype.

## Open it

Double-click **`index.html`**. It is a single self-contained file, so you can email it or share it on Teams as-is. It needs internet access to load React and the font.

Or serve it locally: `node serve.js`, then open http://localhost:5180.

**Every OTP in the journey is `000000`.**

## Journey

1. **Landing page**: programme benefits and what you'll need. *Start application* opens a popup asking for the **mobile number + OTP**. If that mobile already has an application, you land straight on it (the step you stopped at, or the status page). If not, a new application starts.
2. **Registration**: the mobile is already verified, so only the **email + OTP** is asked.
3. **Entity type & PAN**: choose Individual / Proprietor / Partnership / Company and enter the PAN number. Verifying it shows the name and date of birth (or date of incorporation) as per PAN.
4. **KYC verification**: a loader shows the redirect to DigiLocker, then the e-Aadhaar card (name, DOB, gender, masked Aadhaar number) and the address as per Aadhaar in Indian format (house/flat, street/locality, landmark, city, district, state, PIN code). Firms and companies see the authorised signatory's Aadhaar. FATCA and PEP declaration checkboxes must both be ticked to continue.
5. **Bank account**: account holder name, account type, account number (entered twice) and IFSC, verified with a ₹1 penny drop. A name mismatch asks for a cancelled cheque.
6. **GST & entity documents**: optional GSTIN. Partnerships upload the partnership deed; companies upload the Certificate of Incorporation (COI).
7. **Review & submit**: tick the declaration and **I agree to the Terms & Conditions** (the link opens the T&C, with an *I agree* button). The result is a reference number and a status page showing what happens next: KYC verified → Submitted → Application review → Approved.

Progress saves automatically on the device, one application per mobile number. *Save & exit* (or *Log out*) returns to the landing page; *Start application* with the same mobile picks up where you left off.

**After signing the e-agreement**, the success screen shows the **Agent ID** (with *Copy*) and says the temporary password was sent by SMS (in this prototype it is always `Welcome@123`), an **Open agent portal** link, and a short *How to use your Agent ID* guide. The portal link is set by `AGENT_PORTAL_URL` at the top of `src/onboarding.js` (now the agent portal, `agent.html`).

## Approver panel (QC approval)

Open **`approver.html`** (or http://localhost:5180/approver.html when served).

- **☰ menu**: *Approval* is the first option. *Reset sample data* is also there.
- **All / Pending / Approved / E-agreement signed / Rejected** tabs with counts (*Approved* = e-agreement sent and waiting for signature), plus search (name, reference, PAN, mobile, email). Click the **Submitted** column header to sort newest or oldest first.
- **Review** shows everything captured in onboarding: applicant, PAN, **KYC information** (photo from Aadhaar, details and address), FATCA/PEP declarations, bank account (name match with PAN as a %), and GST and documents. Empty fields show "—". Uploaded documents and cheques have a **View** button. Real uploads open as the actual file; sample applications show a placeholder preview.
- Two actions on pending applications, at the bottom right: **Approve & send e-agreement** and **Reject** (needs a reason). Approving asks for the **commercials** as *From – To → then partner share* rules: Option 1 *Interest rate share* (one or more parameters via **+ Add another parameter**; ranges cannot overlap) and/or Option 2 *Processing fee share* (one or more parameters: based on **loan amount**, condition **<, >, <=, >=**, amount ₹, then **share amount ₹**; duplicate conditions are blocked). At least one option is required, values must be 0–100, and To can't be lower than From. The commercials are written into the partner agreement. After approval, the applicant's status page shows every step completed and a **Sign e-agreement** button (agreement preview and consent, then **e-Sign via DigiLocker**, with the same redirect loader as the KYC step). Once signed, they get an agent code and the approver sees "Signed by the partner".
- Comes with sample applications. An application submitted in the onboarding app on the same browser and origin shows up as **New** under Pending, and the decision appears on the applicant's status page.

## Agent portal

Open **`agent.html`** (or http://localhost:5180/agent.html when served). The *Open agent portal* button on the onboarding success screen links here with the Agent ID filled in.

- **Sign in** with **User ID** (the Agent ID) and **password**. On the **first login** the partner uses the temporary password shown on the onboarding success screen, then must **set a new password** (8+ characters with upper and lower case, a number and a special character). After that, they sign in with User ID and their own password. **Forgot password?** sends an OTP (`000000`) to the registered mobile. Passwords are stored as a hash in the browser (prototype only). Demo: **LAMF-AG1101** / temporary password **Welcome@123**.
- **Dashboard**: *Welcome {name}*, then count tiles for **Total leads, Not started, In progress, Sanctioned, Disbursed** (click a tile to filter the table), then **All Leads**: search, **Share unique link** and **Create a new lead** (name, mobile, PAN, optional email, product; duplicates are blocked). Columns: Generated Date, Client Name, Product (with a filter), Status, **Disbursed amount** (for disbursed leads), Contact Number, PAN Number, and **Share Link** per lead.
- **☰ menu** has Dashboard. The top bar has **Need Help?** (helpline details) and **My Account** (Agent ID, mobile, PAN, copy Agent ID, sign out).

## Design system

All three pages follow *Design System | SANTAM B2B Portal* through `src/ds.css`, which loads last:

- **Colour:** yellow primary (500 `#FEBD27`), navy secondary (500 `#002469`), neutral, positive, warning and error ramps.
- **Type:** Poppins (the file also uses Gilmer, which isn't freely available).
- **Components:** 48px buttons with an 8px radius (yellow primary with navy text, grey secondary, red outline for destructive actions), filled grey inputs with a navy focus and red error border, blue links (`#277EFC`), and status pills from the semantic ramps.
- **Patterns:** label-over-value details, review section cards with **Edit** links, design-system popups (icon circle, centred title, full-width actions, including *Would you like to save your progress?*), and a green success tick with a soft ring.

The file's photos are not used (two carry stock-photo watermarks).

## Editing

The source is in `src/`:
- `onboarding.js`: the journey
- `approver.js` and `approver.css`: the approver panel
- `agent.js` and `agent.css`: the agent portal
- `ui.js`: shared components
- `base.css` and `extra.css`: styles
- `ds.css`: design-system tokens and components (loaded last)
- `logo.svg`: header logo, embedded into both pages at build time

After editing, rebuild both pages with:

```bash
node build.js
```
