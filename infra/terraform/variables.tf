variable "region" {
  description = "AWS region donde se despliega massivo-app"
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "Profile local de AWS CLI a usar (~/.aws/credentials)"
  type        = string
  default     = "massivo"
}

variable "project" {
  description = "Identificador del proyecto, usado como prefijo y tag"
  type        = string
  default     = "massivo"
}

variable "env" {
  description = "Entorno (prod, staging, dev). Hoy solo prod."
  type        = string
  default     = "prod"
}

variable "ssh_public_key_path" {
  description = "Ruta al archivo .pub con la clave SSH a registrar en AWS"
  type        = string
  default     = "~/.ssh/massivo_aws.pub"
}

variable "ssh_ingress_cidrs" {
  description = "CIDRs autorizados a conectarse por SSH (22/tcp) a la EC2. Default abierto: la auth la hace la key, no la IP."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "ec2_instance_type" {
  description = "Tipo de instancia EC2 (ARM, Graviton)"
  type        = string
  default     = "t4g.small"
}

variable "ec2_root_volume_gb" {
  description = "Tamaño del volumen raíz (gp3) de la EC2 en GiB"
  type        = number
  default     = 20
}

variable "rds_instance_class" {
  description = "Instance class de RDS"
  type        = string
  default     = "db.t4g.micro"
}

variable "rds_allocated_storage_gb" {
  description = "Storage inicial de RDS en GiB"
  type        = number
  default     = 20
}

variable "rds_engine_version" {
  description = "Versión major de Postgres (AWS elige el minor más reciente)"
  type        = string
  default     = "16"
}

variable "rds_database_name" {
  description = "Nombre de la database principal a crear"
  type        = string
  default     = "massivo"
}

variable "rds_master_username" {
  description = "Usuario master de Postgres"
  type        = string
  default     = "massivo"
}

variable "frontend_domain" {
  description = "Dominio en el que vive el frontend del SaaS (subdominio de massivo.app)"
  type        = string
  default     = "panel.massivo.app"
}

variable "landing_apex_domain" {
  description = "Dominio raíz para la landing marketing"
  type        = string
  default     = "massivo.app"
}

variable "landing_www_domain" {
  description = "Alias www para la landing"
  type        = string
  default     = "www.massivo.app"
}

variable "github_repo" {
  description = "Repo de GitHub que puede assumir el role de CI (formato owner/repo)"
  type        = string
  default     = "maxidiflumeri/massivo-app"
}

variable "github_oidc_thumbprints" {
  description = "Thumbprints del certificado SSL de token.actions.githubusercontent.com (rotan eventualmente)"
  type        = list(string)
  default = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}
