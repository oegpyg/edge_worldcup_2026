import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { BackofficeController } from './backoffice/backoffice.controller';
import { BackofficeService } from './backoffice/backoffice.service';
import { DatabaseService } from './database/database.service';
import { MailService } from './mail/mail.service';

@Module({
  imports: [],
  controllers: [AppController, AuthController, BackofficeController],
  providers: [AuthService, BackofficeService, DatabaseService, MailService],
})
export class AppModule {}
