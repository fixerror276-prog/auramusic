import { sendBrevoOtpEmail } from './brevo_mailer.mjs';

async function testBrevo() {
  console.log('Testing Brevo SMTP connection with recipient: singpankaj817@gmail.com');
  try {
    const res = await sendBrevoOtpEmail({
      host: 'smtp-relay.brevo.com',
      port: 587,
      user: 'c33031001@smtp-brevo.com',
      pass: 'xsmtpsib-2f700a2d1ccd96a59acf52194d846a458c77243d261771f15ba621528f0d0708-SJYkWPQ5eer2oRsv',
      from: 'ytpr621@gmail.com',
      to: 'singpankaj817@gmail.com',
      otpCode: '849201'
    });
    console.log('SUCCESS RESULT:', res);
  } catch (e) {
    console.error('FAILED RESULT:', e);
  }
}
testBrevo();
