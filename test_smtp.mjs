import tls from 'node:tls';

function sendSmtpMail({ host, port, user, pass, to, subject, html }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(port, host, () => {
      console.log('Connected to SMTP server:', host);
    });

    let step = 0;
    socket.setEncoding('utf8');

    socket.on('data', (data) => {
      console.log('SMTP <', data.trim());
      const code = parseInt(data.slice(0, 3), 10);

      if (step === 0 && code === 220) {
        socket.write(`EHLO localhost\r\n`);
        step = 1;
      } else if (step === 1 && code === 250) {
        socket.write(`AUTH LOGIN\r\n`);
        step = 2;
      } else if (step === 2 && code === 334) {
        socket.write(`${Buffer.from(user).toString('base64')}\r\n`);
        step = 3;
      } else if (step === 3 && code === 334) {
        socket.write(`${Buffer.from(pass).toString('base64')}\r\n`);
        step = 4;
      } else if (step === 4 && code === 235) {
        socket.write(`MAIL FROM:<${user}>\r\n`);
        step = 5;
      } else if (step === 5 && code === 250) {
        socket.write(`RCPT TO:<${to}>\r\n`);
        step = 6;
      } else if (step === 6 && code === 250) {
        socket.write(`DATA\r\n`);
        step = 7;
      } else if (step === 7 && code === 354) {
        const msg = [
          `From: "Freefy Aura" <${user}>`,
          `To: <${to}>`,
          `Subject: ${subject}`,
          `MIME-Version: 1.0`,
          `Content-Type: text/html; charset=UTF-8`,
          ``,
          html,
          `.`
        ].join('\r\n');
        socket.write(msg + '\r\n');
        step = 8;
      } else if (step === 8 && code === 250) {
        socket.write(`QUIT\r\n`);
        resolve(true);
      }
    });

    socket.on('error', (err) => {
      console.error('SMTP Error:', err);
      reject(err);
    });
  });
}
