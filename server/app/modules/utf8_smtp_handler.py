import logging
import smtplib
from email.message import EmailMessage
from email.utils import formatdate
from logging.handlers import SMTPHandler


class Utf8SMTPHandler(SMTPHandler):
    def emit(self, record: logging.LogRecord):
        try:
            port = self.mailport
            if not port:
                port = smtplib.SMTP_PORT

            smtp = smtplib.SMTP(self.mailhost, port, timeout=self.timeout)
            msg = EmailMessage()
            msg['From'] = self.fromaddr
            msg['To'] = self.toaddrs
            msg['Subject'] = self.getSubject(record)
            msg.set_content(self.format(record))

            if self.username:
                if self.secure is not None:
                    smtp.ehlo()
                    smtp.starttls(*self.secure)
                    smtp.ehlo()
                smtp.login(self.username, self.password)

            smtp.send_message(msg, self.fromaddr, self.toaddrs)
            smtp.quit()

        except Exception:
            self.handleError(record)
