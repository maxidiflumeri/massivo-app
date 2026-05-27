import { Module } from '@nestjs/common';
import { ContactMergeController } from './contact-merge.controller';
import { ContactMergeService } from './contact-merge.service';
import { ContactTimelineService } from './contact-timeline.service';
import { ContactUpsertService } from './contact-upsert.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { ContactReportsController } from './reports/contact-reports.controller';
import { ContactReportsService } from './reports/contact-reports.service';

@Module({
  controllers: [
    ContactMergeController,
    ContactsController,
    TagsController,
    ContactReportsController,
  ],
  providers: [
    ContactMergeService,
    ContactTimelineService,
    ContactUpsertService,
    ContactsService,
    TagsService,
    ContactReportsService,
  ],
  exports: [ContactUpsertService],
})
export class ContactsModule {}
