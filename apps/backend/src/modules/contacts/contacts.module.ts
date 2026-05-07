import { Module } from '@nestjs/common';
import { ContactImportsController } from './contact-imports.controller';
import { ContactImportsService } from './contact-imports.service';
import { ContactMergeController } from './contact-merge.controller';
import { ContactMergeService } from './contact-merge.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  controllers: [
    ContactImportsController,
    ContactMergeController,
    ContactsController,
    TagsController,
  ],
  providers: [ContactImportsService, ContactMergeService, ContactsService, TagsService],
})
export class ContactsModule {}
