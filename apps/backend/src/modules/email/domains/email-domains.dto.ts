import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Regex de validación de dominio FQDN (sin protocolo, sin path):
 *   - Labels alphanumeric + hyphen, 1-63 chars cada uno
 *   - Mínimo 2 labels separados por dot (rechaza TLDs solos como "localhost")
 *   - TLD: mínimo 2 letras
 *
 * Acepta subdominios (mail.empresa.com), rechaza wildcards (*.x.com),
 * IPs, y trailing/leading dots.
 */
const FQDN_REGEX = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,}$/;

export class CreateEmailDomainDto {
  @IsString()
  @MinLength(4)
  @MaxLength(253)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(FQDN_REGEX, {
    message: 'domain debe ser un FQDN válido (ej: empresa.com o mail.empresa.com)',
  })
  domain!: string;
}
