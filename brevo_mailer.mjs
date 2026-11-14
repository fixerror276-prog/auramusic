import net from 'node:net';
import tls from 'node:tls';

export function sendBrevoOtpEmail({ host, port, user, pass, from, to, otpCode, resetLink, subject, isPasswordReset = false }) {
  return new Promise((resolve, reject) => {
    let socket = net.createConnection(port, host, () => {
      console.log(`[BREVO SMTP] Connected to ${host}:${port}`);
    });

    socket.setEncoding('utf8');
    socket.setTimeout(15000);

    let state = 'INIT';

    function sendCommand(cmd) {
      socket.write(cmd + '\r\n');
    }

    function onData(data) {
      console.log('[BREVO SMTP <]', data.trim());
      const lines = data.split('\r\n').filter(Boolean);
      const lastLine = lines[lines.length - 1] || '';
      const code = parseInt(lastLine.slice(0, 3), 10);

      const isComplete = lastLine.charAt(3) === ' ' || lastLine.length === 3;
      if (!isComplete) return;

      try {
        if (state === 'INIT' && code === 220) {
          state = 'EHLO_PLAIN';
          sendCommand('EHLO localhost');
        } else if (state === 'EHLO_PLAIN' && code === 250) {
          state = 'STARTTLS';
          sendCommand('STARTTLS');
        } else if (state === 'STARTTLS' && code === 220) {
          socket.removeAllListeners('data');
          socket.removeAllListeners('error');
          socket.removeAllListeners('timeout');

          const secureSocket = tls.connect({
            socket: socket,
            host: host,
            rejectUnauthorized: false
          }, () => {
            console.log('[BREVO SMTP] STARTTLS handshake successful');
            state = 'EHLO_TLS';
            secureSocket.write('EHLO localhost\r\n');
          });

          secureSocket.setEncoding('utf8');
          secureSocket.setTimeout(15000);
          socket = secureSocket;
          socket.on('data', onData);
          socket.on('error', (err) => {
            console.error('[BREVO SMTP TLS ERROR]:', err);
            reject(err);
          });
          socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('Brevo SMTP timeout'));
          });
        } else if (state === 'EHLO_TLS' && code === 250) {
          state = 'AUTH_LOGIN';
          sendCommand('AUTH LOGIN');
        } else if (state === 'AUTH_LOGIN' && code === 334) {
          state = 'AUTH_USER';
          sendCommand(Buffer.from(user).toString('base64'));
        } else if (state === 'AUTH_USER' && code === 334) {
          state = 'AUTH_PASS';
          sendCommand(Buffer.from(pass).toString('base64'));
        } else if (state === 'AUTH_PASS' && code === 235) {
          console.log('[BREVO SMTP] Authentication successful!');
          state = 'MAIL_FROM';
          sendCommand(`MAIL FROM:<${from}>`);
        } else if (state === 'MAIL_FROM' && code === 250) {
          state = 'RCPT_TO';
          sendCommand(`RCPT TO:<${to}>`);
        } else if (state === 'RCPT_TO' && code === 250) {
          state = 'DATA';
          sendCommand('DATA');
        } else if (state === 'DATA' && code === 354) {
          state = 'SENDING_CONTENT';
          const emailSubject = subject || (isPasswordReset 
            ? `Your AuraMusic Password Reset Link & Code: ${otpCode}`
            : `Your AuraMusic Verification Code: ${otpCode}`);

          const resetLinkHtml = resetLink ? `
            <div style="margin: 28px 0 20px;">
              <a href="${resetLink}" style="display: inline-block; background-color: #fe4559; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 28px; border-radius: 9999px; box-shadow: 0 4px 15px rgba(254, 69, 89, 0.4);">
                Click to Reset Password
              </a>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 10px; word-break: break-all;">
                Or open this link: <a href="${resetLink}" style="color: #fe4559;">${resetLink}</a>
              </div>
            </div>
          ` : '';

          const emailMessage = [
            `From: "AuraMusic" <${from}>`,
            `To: <${to}>`,
            `Subject: ${emailSubject}`,
            `MIME-Version: 1.0`,
            `Content-Type: text/html; charset=UTF-8`,
            ``,
            `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #121316; padding: 40px 20px; color: #f2f2f2;">`,
            `  <div style="max-width: 480px; margin: 0 auto; background-color: #1c1d22; border-radius: 16px; padding: 36px 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); text-align: center; border: 1px solid rgba(255,255,255,0.08);">`,
            `    <h2 style="color: #fe4559; margin-top: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">AuraMusic ${isPasswordReset ? 'Password Reset' : 'Verification'}</h2>`,
            `    <p style="color: #cbd5e1; font-size: 15px; margin: 16px 0 24px; line-height: 1.5;">`,
            `      ${isPasswordReset ? 'You requested to reset your AuraMusic password. Click the button below or enter the 6-digit code:' : 'Use the following 6-digit confirmation code to complete your verification and access your account:'}`,
            `    </p>`,
            resetLinkHtml,
            `    <div style="font-size: 13px; color: #94a3b8; margin-bottom: 8px;">6-Digit Security Code:</div>`,
            `    <div style="background-color: #141518; border: 2px solid #fe4559; border-radius: 10px; padding: 16px 24px; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #fe4559; margin: 12px 0 24px; user-select: all;">`,
            `      ${otpCode}`,
            `    </div>`,
            `    <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin-bottom: 24px;">`,
            `      ⏱️ This link & code will expire in <b>5 minutes</b>.<br/>`,
            `      If you didn't request this, you can safely ignore this email.`,
            `    </p>`,
            `    <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; font-size: 12px; color: #64748b;">`,
            `      AuraMusic Lossless Audio • 100% Ad-Free Streaming`,
            `    </div>`,
            `  </div>`,
            `</div>`,
            `.`
          ].join('\r\n');

          socket.write(emailMessage + '\r\n');
        } else if (state === 'SENDING_CONTENT' && code === 250) {
          state = 'QUIT';
          sendCommand('QUIT');
          console.log(`[BREVO SMTP] Email successfully delivered to ${to}! Message ID: ${lastLine}`);
          resolve({ success: true, response: lastLine });
        } else if (code >= 400) {
          console.error(`[BREVO SMTP ERROR CODE ${code}]:`, lastLine);
          reject(new Error(`SMTP Error (${code}): ${lastLine}`));
        }
      } catch (err) {
        reject(err);
      }
    }

    socket.on('data', onData);
    socket.on('error', (err) => {
      console.error('[BREVO SMTP SOCKET ERROR]:', err);
      reject(err);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Brevo SMTP connection timed out'));
    });
  });
}
