// utils/emailSender.js

import nodemailer from 'nodemailer';
import logger from '../Utils/logger.js';

/**
 * Function to create a modern email template
 */
 // <p style="margin: 10px 0;">Hello ${guestName},</p>
// <p style="margin: 10px 0;">We are excited to share the captured memories from the <strong>${eventName}</strong> with you.</p>

const createEmailTemplate = (guestName, galleryLink, companyName, eventName, groom = null, bride = null) => {
  let greetingSection = '';

  if (groom && bride) {
    greetingSection = `
      <p style="margin: 10px 0;">Dear ${guestName},</p>
      <p style="margin: 10px 0;">We, ${groom} and ${bride}, are thrilled to have shared our special day with you. Your presence made our event even more memorable.</p>
      <p style="margin: 10px 0;">Thank you for being a part of our journey. We hope you enjoy the captured memories as much as we do.</p>
      <p style="margin: 10px 0;">With love,</p>
      <p style="margin: 10px 0; font-weight: bold;">${groom} and ${bride}</p>
    `;
  }else{
    greetingSection = `
    <p style="margin: 10px 0;">Dear ${guestName},</p>
    <p style="margin: 10px 0;">Thank you for joining and making our family get-together a wonderful and memorable occasion.</p>
  `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Event Gallery</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f9f9f9;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
        }
        .header h1 {
          color: #F46036;
          margin: 0;
          font-size: 24px;
        }
        .content {
          margin-bottom: 20px;
          font-size: 16px;
          line-height: 1.5;
        }
        .button {
          text-align: center;
          margin-top: 20px;
        }
        .button a {
          display: inline-block;
          background-color: #F46036;
          color: #fff;
          text-decoration: none;
          padding: 12px 25px;
          border-radius: 5px;
          font-size: 16px;
        }
        .button a:hover {
          background-color: #d8442c;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          color: #999999;
          font-size: 12px;
        }
        @media only screen and (max-width: 600px) {
          .container {
            padding: 15px;
          }
          .button a {
            width: 100%;
            padding: 14px 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Your Event Gallery is Ready!</h1>
          <p style="margin: 10px 0;">Love from ${companyName}</p>
        </div>
        <div class="content">
          ${greetingSection}
          <p class="centered-paragraph">Click the button below to view your personalized gallery.</p>
        </div>
        <div class="button">
          <a href="${galleryLink}" target="_blank">View My Images</a>
        </div>
        <div class="footer">
          <p>You received this email because you are a guest of <strong>${eventName}</strong>.</p>
          <p>If you have any questions, feel free to contact us at <a href="mailto:support@yourdomain.com">tech@hapzea.com</a>.</p>
          <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};



/**
 * Function to send media (emails) to guests
 */
export const sendMedia = async (email, magic_url, company_name, event_name, guestName, groom = null, bride = null) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS, 
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      bcc: 'tech@hapzea.com', // Add BCC field here
      subject: `Your Memories from ${event_name} Are Ready!`,
      html: createEmailTemplate(guestName, magic_url, company_name, event_name, groom, bride),
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${email}: ${info.messageId}`);
    return "Email sent successfully!";
  } catch (error) {
    logger.error('Error sending email:', { email, error: error.message, stack: error.stack });
    throw error;
  }
};
