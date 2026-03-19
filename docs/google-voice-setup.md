# Google Voice → JARVIS SMS Setup

## Step 1: Set Up Google Voice

1. Go to https://voice.google.com
2. Sign in with **jarvishelper365@gmail.com**
3. Pick a phone number (this becomes your JARVIS number)
4. Go to **Settings** (gear icon) → **Messages**
5. Turn ON **"Forward messages to email"**

Now every text sent to your Google Voice number will also arrive as an email in Gmail.

## Step 2: Create the Google Apps Script

1. Go to https://script.google.com (signed in as jarvishelper365@gmail.com)
2. Click **"New Project"**
3. Delete everything in the editor
4. Paste the code below
5. Click **Save** (name it "JARVIS SMS Forwarder")

```javascript
// JARVIS SMS Forwarder
// Watches Gmail for Google Voice SMS notifications and forwards to JARVIS

const JARVIS_WEBHOOK = 'https://jarvis-app-45l.pages.dev/api/sms';
const WEBHOOK_SECRET = 'e27081309c94b2d4e0ea3bbf31b76f4d';
const LABEL_NAME = 'JARVIS_PROCESSED';

function checkForNewSMS() {
  // Search for unread Google Voice SMS emails
  var threads = GmailApp.search('from:voice-noreply@google.com subject:"New text message" is:unread', 0, 10);

  if (threads.length === 0) return;

  // Get or create processed label
  var label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) label = GmailApp.createLabel(LABEL_NAME);

  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();

    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      if (!message.isUnread()) continue;

      var body = message.getPlainBody();
      var subject = message.getSubject();
      var date = message.getDate();

      // Extract phone number and message from Google Voice email
      var parsed = parseGVEmail(body, subject);

      if (parsed) {
        // Forward to JARVIS
        try {
          var response = UrlFetchApp.fetch(JARVIS_WEBHOOK, {
            method: 'PUT',
            contentType: 'application/json',
            payload: JSON.stringify({
              from: parsed.from,
              message: parsed.message,
              timestamp: date.toISOString(),
              webhookSecret: WEBHOOK_SECRET
            }),
            muteHttpExceptions: true
          });

          Logger.log('Forwarded SMS from ' + parsed.from + ': ' + response.getContentText());
        } catch (e) {
          Logger.log('Error forwarding: ' + e.message);
        }
      }

      // Mark as read
      message.markRead();
    }

    // Add processed label
    threads[i].addLabel(label);
  }
}

function parseGVEmail(body, subject) {
  try {
    // Google Voice emails have format like:
    // New text message from (555) 123-4567
    // Body contains the actual message text

    var phoneMatch = subject.match(/from\s+([(\d)\s\-+]+)/i) || body.match(/from\s+([(\d)\s\-+]+)/i);
    var phone = phoneMatch ? phoneMatch[1].replace(/[^\d+]/g, '') : 'unknown';

    // The message body - remove Google Voice footer/header
    var lines = body.split('\n');
    var messageLines = [];
    var started = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      // Skip header lines
      if (line.includes('New text message') || line.includes('voice-noreply')) continue;
      if (line.includes('YOUR ACCOUNT') || line.includes('HELP CENTER')) break;
      if (line.includes('To respond to this text message')) break;
      if (line === '') {
        if (started) continue;
        started = true;
        continue;
      }

      if (started || line.length > 0) {
        messageLines.push(line);
        started = true;
      }
    }

    var message = messageLines.join(' ').trim();

    // Fallback: just use the whole body minus obvious headers
    if (!message) {
      message = body.replace(/New text message from.*\n/g, '')
                     .replace(/To respond to this text message.*/gs, '')
                     .replace(/YOUR ACCOUNT.*/gs, '')
                     .trim()
                     .split('\n')[0];
    }

    if (!message) return null;

    return { from: phone, message: message };
  } catch (e) {
    Logger.log('Parse error: ' + e.message);
    return null;
  }
}

// Test function - run this manually to verify it works
function testWebhook() {
  var response = UrlFetchApp.fetch(JARVIS_WEBHOOK, {
    method: 'PUT',
    contentType: 'application/json',
    payload: JSON.stringify({
      from: '+15551234567',
      message: 'Test message from Google Apps Script',
      timestamp: new Date().toISOString(),
      webhookSecret: WEBHOOK_SECRET
    }),
    muteHttpExceptions: true
  });

  Logger.log('Test response: ' + response.getContentText());
}
```

## Step 3: Set Up the Trigger (Auto-run)

1. In the Apps Script editor, click the **clock icon** (Triggers) on the left sidebar
2. Click **"+ Add Trigger"**
3. Settings:
   - Function: **checkForNewSMS**
   - Deployment: **Head**
   - Event source: **Time-driven**
   - Type: **Minutes timer**
   - Interval: **Every 1 minute**
4. Click **Save**
5. Grant permissions when prompted (it needs Gmail access)

## Step 4: Test It

1. In the Apps Script editor, select **testWebhook** from the function dropdown
2. Click **Run**
3. Check the JARVIS app inbox — you should see the test message

## Step 5: Send a Real Text

Text your Google Voice number from your real phone. Within 1-2 minutes:
1. Google Voice forwards the email to Gmail
2. Apps Script detects the email
3. Script POSTs to JARVIS webhook
4. JARVIS AI reads the message and stores it in your inbox

## Troubleshooting

- **No emails appearing:** Make sure "Forward messages to email" is ON in Google Voice settings
- **Script not running:** Check the Triggers page for errors, re-authorize if needed
- **Can't parse message:** Check Apps Script logs (View → Executions) for errors
