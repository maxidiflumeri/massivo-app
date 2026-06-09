output "account_id" {
  description = "AWS account ID detectado vía CLI profile"
  value       = data.aws_caller_identity.current.account_id
}

output "caller_arn" {
  description = "ARN del usuario/role que ejecuta terraform"
  value       = data.aws_caller_identity.current.arn
}

output "region" {
  description = "Región AWS activa"
  value       = data.aws_region.current.name
}

output "default_vpc_id" {
  description = "VPC default de la cuenta en esta región"
  value       = data.aws_vpc.default.id
}

output "default_subnets" {
  description = "Subnets default (públicas) de la VPC default"
  value       = data.aws_subnets.default_public.ids
}

output "ssh_key_name" {
  description = "Nombre de la key pair registrada en AWS para SSH a la EC2"
  value       = aws_key_pair.maxi.key_name
}

output "ec2_security_group_id" {
  description = "Security Group ID para la EC2"
  value       = aws_security_group.ec2.id
}

output "rds_security_group_id" {
  description = "Security Group ID para RDS (solo acepta tráfico desde el SG de EC2)"
  value       = aws_security_group.rds.id
}

output "ec2_instance_id" {
  description = "ID de la EC2 que corre la API"
  value       = aws_instance.api.id
}

output "ec2_ami_id" {
  description = "AMI usada (Ubuntu 24.04 ARM más reciente al momento del apply)"
  value       = data.aws_ami.ubuntu_arm64.id
}

output "ec2_public_ip" {
  description = "IP pública (Elastic IP) de la API — registrar como A record del api_domain en tu DNS"
  value       = aws_eip.api.public_ip
}

output "ec2_public_dns" {
  description = "DNS público de la instancia"
  value       = aws_instance.api.public_dns
}

output "ssh_connect_command" {
  description = "Comando para conectarte por SSH"
  value       = "ssh -i ${trimsuffix(var.ssh_public_key_path, ".pub")} ubuntu@${aws_eip.api.public_ip}"
}

output "rds_endpoint" {
  description = "Endpoint (host:port) de la DB RDS"
  value       = aws_db_instance.main.endpoint
}

output "rds_host" {
  description = "Host de la DB RDS"
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "Puerto de la DB"
  value       = aws_db_instance.main.port
}

output "rds_database" {
  description = "Nombre de la database"
  value       = aws_db_instance.main.db_name
}

output "rds_username" {
  description = "Usuario master"
  value       = aws_db_instance.main.username
}

output "rds_password" {
  description = "Password master generado por terraform (ver con: terraform output -raw rds_password)"
  value       = random_password.rds.result
  sensitive   = true
}

output "s3_frontend_bucket" {
  description = "Bucket S3 donde sube el build del frontend"
  value       = aws_s3_bucket.frontend.id
}

output "acm_validation_records" {
  description = "Registros DNS que hay que crear MANUALMENTE en tu DNS para validar el cert ACM del frontend"
  value = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "cloudfront_distribution_id" {
  description = "ID de la distribución CloudFront"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain" {
  description = "Dominio CloudFront (xxx.cloudfront.net) — apuntar el frontend_domain a esto vía CNAME en tu DNS"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "landing_s3_bucket" {
  description = "Bucket S3 donde sube el build de la landing"
  value       = aws_s3_bucket.landing.id
}

output "landing_acm_validation_records" {
  description = "Registros DNS para validar el cert ACM de la landing (2 SANs: apex + www del landing)"
  value = {
    for dvo in aws_acm_certificate.landing.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "landing_cloudfront_distribution_id" {
  description = "ID CloudFront landing"
  value       = aws_cloudfront_distribution.landing.id
}

output "landing_cloudfront_domain" {
  description = "Dominio CloudFront landing — apuntar apex + www del landing a esto en tu DNS"
  value       = aws_cloudfront_distribution.landing.domain_name
}

output "docs_s3_bucket" {
  description = "Bucket S3 donde sube el build de la docs"
  value       = aws_s3_bucket.docs.id
}

output "docs_acm_validation_records" {
  description = "Registros DNS que hay que crear en tu DNS para validar el cert ACM de docs (docs_domain)"
  value = {
    for dvo in aws_acm_certificate.docs.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

output "docs_cloudfront_distribution_id" {
  description = "ID CloudFront docs"
  value       = aws_cloudfront_distribution.docs.id
}

output "docs_cloudfront_domain" {
  description = "Dominio CloudFront docs — apuntar el docs_domain a esto vía CNAME en tu DNS"
  value       = aws_cloudfront_distribution.docs.domain_name
}

# ===========================================================
# CI/CD outputs — usar en GitHub Secrets / vars de workflows
# ===========================================================

output "ecr_backend_repository_url" {
  description = "URL del repo ECR para el backend (host + repo, sin tag)"
  value       = aws_ecr_repository.backend.repository_url
}

output "github_actions_role_arn" {
  description = "Role ARN que GitHub Actions debe assumir vía OIDC"
  value       = aws_iam_role.github_actions.arn
}

output "ses_events_sns_topic_arn" {
  description = "ARN del SNS topic donde SES publica eventos — setear en .env como SES_EVENTS_SNS_TOPIC_ARN"
  value       = aws_sns_topic.ses_events.arn
}
