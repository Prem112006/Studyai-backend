import nodemailer from 'nodemailer';

const sendEmail = async (options) => {
  let transporter;

  // Check if SMTP settings are provided in env
  const hasEnvSMTP =
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_EMAIL &&
    process.env.SMTP_PASSWORD;

  if (hasEnvSMTP) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    console.log('Using SMTP configuration from environment variables.');
  } else {
    // Fallback: Create ethereal test account for local development
    console.log('No SMTP configurations found in .env. Creating a temporary Ethereal test account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log(`Temporary Ethereal Email account created: ${testAccount.user}`);
    } catch (err) {
      console.error('Failed to create Ethereal test account:', err);
      throw err;
    }
  }

  const message = {
    from: `${process.env.FROM_NAME || 'StudyAI'} <${process.env.FROM_EMAIL || 'noreply@studyai.com'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  const info = await transporter.sendMail(message);

  console.log('Message sent: %s', info.messageId);
  
  // Preview URL if Ethereal is used
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('-----------------------------------------');
    console.log('ETHEREAL EMAIL PREVIEW URL (Click to view email):');
    console.log(previewUrl);
    console.log('-----------------------------------------');
    // Attach to option object so the caller controller can read it
    options.previewUrl = previewUrl;
  }
};

export default sendEmail;
