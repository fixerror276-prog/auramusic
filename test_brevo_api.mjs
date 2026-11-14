async function testBrevoApi() {
  const apiKey = 'xsmtpsib-2f700a2d1ccd96a59acf52194d846a458c77243d261771f15ba621528f0d0708-SJYkWPQ5eer2oRsv';
  console.log('Testing Brevo v3 Transactional Email REST API...');
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Freefy Aura Music', email: 'ytpr621@gmail.com' },
        to: [{ email: 'singpankaj817@gmail.com' }],
        subject: 'Your Freefy Verification Code: 938210',
        htmlContent: '<div style="font-family:Arial;padding:20px;background:#1e1e1e;color:#fff;"><h2 style="color:#fe4559;">Freefy Verification Code</h2><p>Your 6-digit OTP code is:</p><h1 style="letter-spacing:6px;color:#fe4559;">938210</h1><p>Expires in 5 minutes.</p></div>'
      })
    });
    console.log('Brevo API Status:', res.status);
    const body = await res.text();
    console.log('Brevo API Response:', body);
  } catch (err) {
    console.error('API Error:', err);
  }
}
testBrevoApi();
