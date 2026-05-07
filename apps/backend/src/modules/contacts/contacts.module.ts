import { Module } from '@nestjs/common';
import { ContactImportsController } from './contact-imports.controller';
import { ContactImportsService } from './contact-imports.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  controllers: [ContactImportsController, ContactsController, TagsController],
  providers: [ContactImportsService, ContactsService, TagsService],
})
export class ContactsModule {}
