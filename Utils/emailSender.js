// utils/emailSender.js

import nodemailer from 'nodemailer';
import logger from '../Utils/logger.js';

/**
 * Function to create a modern email template
 */
const createEmailTemplate = (guestName, galleryLink, companyName, eventName) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Event Gallery</title>
      <style>
        /* CSS styles for the email template */
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #fff;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 20px;
        }
        .header h1 {
          color: #F46036;
          margin: 0;
        }
        .content {
          margin-bottom: 20px;
        }
        .content p {
          font-size: 16px;
          line-height: 1.6;
          margin: 0 0 10px 0;
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
          <p>Love from ${companyName}</p> 
        </div>
        <div class="content"> 
          <p>Hello ${guestName},</p>
          <p>We are excited to share the captured memories from the <strong>${eventName}</strong> with you.</p>
          <p>Click the button below to view your personalized gallery of matching images:</p>
        </div>
        <div class="button">
          <a href="${galleryLink}" target="_blank">View My Images</a> 
        </div>
        <div class="footer">
          <p>You received this email because you are a guest of <strong>${eventName}</strong>.</p>
          <p>If you have any questions, feel free to contact us at <a href="mailto:support@yourdomain.com">support@yourdomain.com</a>.</p>
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
export const sendMedia = async (email, magic_url, company_name, event_name, guestName) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // e.g., "retina@hapzea.com"
        pass: process.env.EMAIL_PASS, // e.g., "nkhz kfjz nvri tkny"
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Your Memories from ${event_name} Are Ready!`,
      html: createEmailTemplate(guestName, magic_url, company_name, event_name),
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${email}: ${info.messageId}`);
    return "Email sent successfully!";
  } catch (error) {
    logger.error('Error sending email:', { email, error: error.message, stack: error.stack });
    throw error;
  }
};
