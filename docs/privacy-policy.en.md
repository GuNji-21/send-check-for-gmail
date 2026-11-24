# Privacy Policy

Applies to: the Chrome extension "Send Check for Gmail" (the "Extension")

Last updated: November 24, 2026

## 1. Information the Extension handles

To perform pre-send checks in Gmail, the Extension reads the following information from the email being composed:

- The sender email address
- Recipient email addresses and display names (To / Cc / Bcc)
- Subject and body
- Information about attachments, such as file names

The Extension also handles the following:

- Settings you register on the options page (internal domains, recipients marked for caution or for skipping confirmation, attachment keywords, which warnings are turned on, etc.)
- Contact records (only when you turn the feature on in the options page; off by default)
  - Who: external recipients (To / Cc / Bcc) of email you send, and the people you put in Cc on email to an external recipient (including internal people)
  - What: email address, display name, domain, how many times the person was in To or Cc, the date of the last send, and which people were in Cc on email to which recipient, with a count
  - Items you enter on the directory page or import from a CSV file: name, company name, other names of the company, department, title, phone number and mobile number
  - Source: the recipient fields of email you compose, what you enter yourself, and a CSV file you choose. The content of email you receive is not read
  - Purpose: to warn you about a domain you are sending to for the first time and about a person you usually Cc who is not included, to compare the salutation and company names in the body with your recipients, to show company names on the confirmation screen, and to let you search by company name
  - Email sent before you turned the feature on, and email sent only to internal recipients, is not recorded

## 2. Processing and transmission

- Email content, recipients and contact information are processed only within your browser and are never sent to any external server.
- The Extension does not communicate with any external server, including servers operated by the developer.
- The Extension does not use the Gmail API.
- The AI typo check (only when you turn it on) uses the AI built into Chrome (Gemini Nano) and runs on your device. Email content is never sent to any external AI service.

## 3. Storage

- Data is stored only on your device. Settings are stored in chrome.storage, and contact records in IndexedDB.
- The subject, body and attachment information are not stored. They are read only while the check is shown.
- Contact records are deleted automatically once a set period has passed since the last send (1 year by default; you can choose from 6 months to 5 years in the options page).
- The developer has no access to your data.

## 4. No sale or advertising use

- The developer does not collect or sell your data.
- Your data is never used for advertising.

## 5. Deleting your data

- You can delete the settings you registered from the Extension's options page.
- You can delete all contact records at any time with "Delete all contact records" in the options page. On the directory page you can delete them one by one.
- You can export contact records to a CSV file. The exported file is only saved on your device; the Extension never sends it anywhere.
- Data stored by the Extension is also removed when you uninstall the Extension.

## 6. Changes to this policy

Any changes to this policy will be announced on this page.

## 7. Contact

For questions about this policy or the Extension, please open an issue on GitHub.

<https://github.com/GuNji-21/send-check-for-gmail/issues>
