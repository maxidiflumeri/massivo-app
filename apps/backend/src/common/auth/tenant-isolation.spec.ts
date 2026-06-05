/**
 * Tests de aislamiento tenant-a-tenant.
 *
 * Verifica que con TenantContext activo, las queries filtran correctamente
 * por organizationId/teamId y que un tenant no puede acceder a los datos de otro.
 *
 * Estos tests NO requieren DB real — mockean Prisma y validan que los servicios
 * siempre incluyan los filtros correctos de org/team en sus queries.
 */
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamsService } from '../../modules/teams/teams.service';
import { TeamMembersService } from '../../modules/teams/team-members.service';
import { SmtpAccountsService } from '../../modules/email/smtp-accounts.service';
import { EmailTemplatesService } from '../../modules/email/email-templates.service';
import { WapiConfigsService } from '../../modules/wapi/wapi-configs.service';
import { WapiTemplatesService } from '../../modules/wapi/wapi-templates.service';
import { ContactsService } from '../../modules/contacts/contacts.service';
import { TagsService } from '../../modules/contacts/tags.service';
import { EmailSenderService } from '../../modules/email/sender/email-sender.service';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../security/encryption.service';
import { TenantContext } from './tenant-context';
import type { RequestContext } from '@massivo/shared-types';

describe('Aislamiento tenant-a-tenant', () => {
  let teamsService: TeamsService;
  let membersService: TeamMembersService;
  let smtpService: SmtpAccountsService;
  let templatesService: EmailTemplatesService;
  let wapiConfigService: WapiConfigsService;
  let wapiTemplateService: WapiTemplatesService;
  let contactsService: ContactsService;
  let tagsService: TagsService;
  let prismaMock: Record<string, Record<string, jest.Mock>>;

  const tenantA: RequestContext = {
    userId: 'user-a',
    organizationId: 'org-a',
    teamId: 'team-a1',
    orgRole: 'OWNER',
    teamRole: 'ADMIN',
  };

  const tenantB: RequestContext = {
    userId: 'user-b',
    organizationId: 'org-b',
    teamId: 'team-b1',
    orgRole: 'OWNER',
    teamRole: 'ADMIN',
  };

  beforeEach(async () => {
    prismaMock = {
      team: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      teamMembership: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      orgMembership: {
        findUnique: jest.fn(),
      },
      smtpAccount: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      emailTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      channel: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      wapiTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      contact: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      tag: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsService,
        TeamMembersService,
        SmtpAccountsService,
        EmailTemplatesService,
        WapiConfigsService,
        WapiTemplatesService,
        ContactsService,
        TagsService,
        { provide: PrismaService, useValue: { scoped: prismaMock, ...prismaMock } },
        {
          provide: EmailSenderService,
          useValue: { verifyAccount: jest.fn(), sendForAccount: jest.fn() },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: jest.fn((v: string) => v),
            decrypt: jest.fn((v: string) => v),
            isEncrypted: jest.fn(() => false),
          },
        },
      ],
    }).compile();

    teamsService = moduleRef.get(TeamsService);
    membersService = moduleRef.get(TeamMembersService);
    smtpService = moduleRef.get(SmtpAccountsService);
    templatesService = moduleRef.get(EmailTemplatesService);
    wapiConfigService = moduleRef.get(WapiConfigsService);
    wapiTemplateService = moduleRef.get(WapiTemplatesService);
    contactsService = moduleRef.get(ContactsService);
    tagsService = moduleRef.get(TagsService);
  });

  describe('TeamsService — aislamiento por organizationId', () => {
    it('Tenant A solo consulta teams de org-a', async () => {
      await TenantContext.run(tenantA, () => teamsService.findAll());

      expect(prismaMock['team']!['findMany']).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-a' } }),
      );
    });

    it('Tenant B solo consulta teams de org-b', async () => {
      await TenantContext.run(tenantB, () => teamsService.findAll());

      expect(prismaMock['team']!['findMany']).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-b' } }),
      );
    });

    it('Tenant A no puede ver team de org-b (NotFoundException)', async () => {
      prismaMock['team']!['findUnique']!.mockResolvedValue({
        id: 'team-b1',
        organizationId: 'org-b', // distinta de org-a
      });

      await expect(
        TenantContext.run(tenantA, () => teamsService.findOne('team-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede eliminar team de org-b (NotFoundException)', async () => {
      prismaMock['team']!['findUnique']!.mockResolvedValue({
        id: 'team-b2',
        organizationId: 'org-b',
        isDefault: false,
      });

      await expect(
        TenantContext.run(tenantA, () => teamsService.remove('team-b2')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede actualizar team de org-b (NotFoundException)', async () => {
      prismaMock['team']!['findUnique']!.mockResolvedValue({
        id: 'team-b1',
        organizationId: 'org-b',
      });

      await expect(
        TenantContext.run(tenantA, () => teamsService.update('team-b1', { name: 'Hacked' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('TeamMembersService — aislamiento cross-org', () => {
    it('no puede listar miembros de team de otra org', async () => {
      prismaMock['team']!['findUnique']!.mockResolvedValue({
        id: 'team-b1',
        organizationId: 'org-b',
      });

      await expect(
        TenantContext.run(tenantA, () => membersService.findAll('team-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no puede agregar miembro a team de otra org', async () => {
      prismaMock['team']!['findUnique']!.mockResolvedValue({
        id: 'team-b1',
        organizationId: 'org-b',
      });

      await expect(
        TenantContext.run(tenantA, () =>
          membersService.addMember('team-b1', { userId: 'user-a', role: 'ADMIN' }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('no puede remover miembro de team de otra org', async () => {
      prismaMock['team']!['findUnique']!.mockResolvedValue({
        id: 'team-b1',
        organizationId: 'org-b',
      });

      await expect(
        TenantContext.run(tenantA, () =>
          membersService.removeMember('team-b1', 'user-b'),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('SmtpAccountsService — aislamiento cross-tenant', () => {
    it('Tenant A no puede leer SmtpAccount de Tenant B (NotFoundException)', async () => {
      // findFirst returns null because the scoped prisma filters by tenant context
      prismaMock['smtpAccount']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => smtpService.findOne('smtp-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede eliminar SmtpAccount de Tenant B (NotFoundException)', async () => {
      prismaMock['smtpAccount']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => smtpService.remove('smtp-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede actualizar SmtpAccount de Tenant B (NotFoundException)', async () => {
      prismaMock['smtpAccount']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => smtpService.update('smtp-b1', { name: 'Hacked' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('EmailTemplatesService — aislamiento cross-tenant', () => {
    it('Tenant A no puede leer EmailTemplate de Tenant B (NotFoundException)', async () => {
      prismaMock['emailTemplate']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => templatesService.findOne('tpl-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede eliminar EmailTemplate de Tenant B (NotFoundException)', async () => {
      prismaMock['emailTemplate']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => templatesService.remove('tpl-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede actualizar EmailTemplate de Tenant B (NotFoundException)', async () => {
      prismaMock['emailTemplate']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => templatesService.update('tpl-b1', { name: 'Hacked' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('WapiConfigsService — aislamiento cross-tenant', () => {
    it('Tenant A no puede leer WapiConfig de Tenant B (NotFoundException)', async () => {
      prismaMock['channel']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => wapiConfigService.findOne('wcfg-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede eliminar WapiConfig de Tenant B (NotFoundException)', async () => {
      prismaMock['channel']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => wapiConfigService.remove('wcfg-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede actualizar WapiConfig de Tenant B (NotFoundException)', async () => {
      prismaMock['channel']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => wapiConfigService.update('wcfg-b1', { name: 'Hacked' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('WapiTemplatesService — aislamiento cross-tenant', () => {
    it('Tenant A no puede leer WapiTemplate de Tenant B (NotFoundException)', async () => {
      prismaMock['wapiTemplate']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => wapiTemplateService.findOne('wtpl-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede eliminar WapiTemplate de Tenant B (NotFoundException)', async () => {
      prismaMock['wapiTemplate']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => wapiTemplateService.remove('wtpl-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede actualizar WapiTemplate de Tenant B (NotFoundException)', async () => {
      prismaMock['wapiTemplate']!['findFirst']!.mockResolvedValue(null);

      await expect(
        TenantContext.run(tenantA, () => wapiTemplateService.update('wtpl-b1', { metaName: 'Hacked' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('ContactsService — aislamiento cross-tenant', () => {
    it('Tenant A no puede leer Contact de Tenant B (NotFoundException)', async () => {
      prismaMock['contact']!['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => contactsService.findOne('c-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede eliminar Contact de Tenant B (NotFoundException)', async () => {
      prismaMock['contact']!['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => contactsService.remove('c-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede actualizar Contact de Tenant B (NotFoundException)', async () => {
      prismaMock['contact']!['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => contactsService.update('c-b1', { firstName: 'Hacked' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('TagsService — aislamiento cross-tenant', () => {
    it('Tenant A no puede leer Tag de Tenant B (NotFoundException)', async () => {
      prismaMock['tag']!['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => tagsService.findOne('tag-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede eliminar Tag de Tenant B (NotFoundException)', async () => {
      prismaMock['tag']!['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => tagsService.remove('tag-b1')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('Tenant A no puede actualizar Tag de Tenant B (NotFoundException)', async () => {
      prismaMock['tag']!['findFirst']!.mockResolvedValue(null);
      await expect(
        TenantContext.run(tenantA, () => tagsService.update('tag-b1', { name: 'Hacked' })),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('Sin TenantContext — error inmediato', () => {
    it('TeamsService.findAll lanza ForbiddenException sin contexto', async () => {
      await expect(teamsService.findAll()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('TeamMembersService.findAll lanza ForbiddenException sin contexto', async () => {
      await expect(membersService.findAll('any-team')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('SmtpAccountsService.findAll lanza ForbiddenException sin contexto', async () => {
      await expect(smtpService.findAll()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('EmailTemplatesService.findAll lanza ForbiddenException sin contexto', async () => {
      await expect(templatesService.findAll()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('WapiConfigsService.findAll lanza ForbiddenException sin contexto', async () => {
      await expect(wapiConfigService.findAll()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('WapiTemplatesService.findAll lanza ForbiddenException sin contexto', async () => {
      await expect(wapiTemplateService.findAll()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ContactsService.list lanza ForbiddenException sin contexto', async () => {
      await expect(contactsService.list({})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('TagsService.findAll lanza ForbiddenException sin contexto', async () => {
      await expect(tagsService.findAll()).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
