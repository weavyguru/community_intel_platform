const sgMail = require('@sendgrid/mail');

const initializeSendGrid = () => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('SendGrid initialized successfully');
};

const getFromEmail = () => {
  return process.env.FROM_EMAIL || 'noreply@weavy.com';
};

module.exports = { initializeSendGrid, sgMail, getFromEmail };
