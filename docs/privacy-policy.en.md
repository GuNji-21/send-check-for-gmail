# Privacy Policy

Applies to: the Chrome extension "Send Check for Gmail" (the "Extension")

Last updated: November 25, 2026

## 1. Information the Extension handles

To perform pre-send checks in Gmail, the Extension reads the following information from the email being composed:

- The sender email address
- Recipient email addresses and display names (To / Cc / Bcc)
- Subject and body
- Information about attachments, such as file names

The Extension also handles the following:

- Settings you register on the options page (internal domains, recipients marked for caution or for skipping confirmation, attachment keywords, which warnings are turned on, etc.)
- The API key of an external AI (only when you choose the external AI typo check on the options page and register a key)
- Contact records (only when you turn the feature on in the options page; off by default)
  - Who: external recipients (To / Cc / Bcc) of email you send, and the people you put in Cc on email to an external recipient (including internal people)
  - What: email address, display name, domain, how many times the person was in To or Cc, the date of the last send, and which people were in Cc on email to which recipient, with a count
  - Items you enter on the directory page or import from a CSV file: name, company name, other names of the company, department, title, phone number and mobile number
  - Source: the recipient fields of email you compose, what you enter yourself, and a CSV file you choose
  - Filling in from received email (only when you turn on "Also fill in contacts from email I receive" in the options page; off by default): the Extension reads the sender (address, display name), the people in the recipient fields (address, display name) and the signature (company name, department, title, phone number, mobile number) of email you open in Gmail, and fills in the details of people who are already in your records. Email from people who are not in your records (such as newsletters) is not recorded. The body itself is not stored
  - Purpose: to warn you about a domain you are sending to for the first time and about a person you usually Cc who is not included, to compare the salutation and company names in the body with your recipients, to show company names on the confirmation screen, and to let you search by company name
  - Email sent before you turned the feature on, and email sent only to internal recipients, is not recorded

## 2. Processing and transmission

- Email content, recipients and contact information are processed only within your browser and are not sent anywhere, except when you choose the "external AI typo check" described below.
- The Extension does not communicate with any server operated by the developer. The developer never receives your data.
- The Extension does not use the Gmail API.
- The AI typo check (only when you turn it on) uses the AI built into Chrome (Gemini Nano) by default and runs on your device. In that case, email content is not sent anywhere.
- External AI typo check (only when you choose it on the options page, register your own API key and allow the connection; not used by default)
  - Destination: the API of the provider you choose (OpenAI at `api.openai.com`, or Anthropic at `api.anthropic.com`). Nothing is sent anywhere else
  - What is sent: the subject and body of the email you are composing (without the quoted part of a reply or forward; for a long email, about the first 4,000 characters), and your API key (only to that provider)
  - What is not sent: recipients, the sender address, attachment names, contact records, and email you receive
  - When: when you perform the send action and the confirmation screen opens
  - What is sent is handled under the terms and privacy policy of each provider. You contract with the provider yourself and pay the API fees yourself
  - Sending stops when you switch back to "AI built into Chrome" on the options page or delete the API key

## 3. Storage

- Data is stored only on your device. Settings and the API key of an external AI are stored in chrome.storage, and contact records in IndexedDB.
- The subject, body and attachment information are not stored. They are read only while the check is shown. The body of email you receive is not stored either (only the company name, department, title and phone numbers read from the signature are saved in the contact records).
- Contact records are deleted automatically once a set period has passed since the last send (1 year by default; you can choose from 6 months to 5 years in the options page).
- The developer has no access to your data.

## 4. No sale or advertising use

- The developer does not collect or sell your data.
- Your data is never used for advertising.

## 5. Deleting your data

- You can delete the settings you registered from the Extension's options page.
- You can delete the API key of an external AI with "Delete API key" in the options page. It is also deleted by "Delete all saved data".
- You can delete all contact records at any time with "Delete all contact records" in the options page. On the directory page you can delete them one by one.
- You can export contact records to a CSV file. The exported file is only saved on your device; the Extension never sends it anywhere.
- Data stored by the Extension is also removed when you uninstall the Extension.

## 6. Changes to this policy

Any changes to this policy will be announced on this page.

## 7. Contact

For questions about this policy or the Extension, please open an issue on GitHub.

<https://github.com/GuNji-21/send-check-for-gmail/issues>
