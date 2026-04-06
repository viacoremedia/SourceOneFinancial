Subject: Webhook Integration Guide – Sending CSV Data

Hi Team,

Please find the integration details below for sending your CSV report data to our webhook endpoint via Omni BI. 

**Endpoint Details**
- **URL:** `[Insert Production URL Here]/webhook`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

**Payload Requirements**
Our endpoint is designed to accept file attachments directly. 
- Attach the CSV report as a standard file upload field.
- You may include any additional metadata (e.g., `reportName`, `source`) as standard text fields within the form data; these will be captured alongside the file automatically.

**Testing the Webhook**
You can run a quick test using the following cURL command to simulate an Omni BI payload:

```bash
curl -X POST "[Insert Production URL Here]/webhook" \
  -F "file=@/path/to/your/test_file.csv" \
  -F "source=omni-bi"
```

**Expected Responses**
- **200 OK:** Webhook was processed and the data was successfully saved.
- **400 Bad Request:** The payload was empty or the request was malformed. Please ensure the Content-Type is set to `multipart/form-data` and a file is attached.
- **500 Internal Server Error:** An unexpected error occurred on our end while processing the data.

Please let us know if you have any questions or require assistance setting this up in Omni BI.

Best regards,
[Your Name/Company]
