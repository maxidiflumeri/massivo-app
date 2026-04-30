import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  controllers: [ContactsController, TagsController],
  providers: [ContactsService, TagsService],
})
export class ContactsModule {}
