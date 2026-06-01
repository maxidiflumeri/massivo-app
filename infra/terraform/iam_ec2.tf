# Instance profile para la EC2.
#
# Le da dos capacidades:
# 1. Hablar con SSM (recibir comandos remotos de GitHub Actions sin SSH).
# 2. Hacer pull de imágenes desde ECR.

resource "aws_iam_role" "ec2" {
  name = "${var.project}-${var.env}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Name = "${var.project}-${var.env}-ec2"
  }
}

# Policy AWS-managed: SSM agent core (heartbeat, comandos, session manager).
resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Permisos de pull de ECR — no necesita push, solo pull de imágenes.
resource "aws_iam_role_policy" "ec2_ecr_pull" {
  name = "${var.project}-${var.env}-ec2-ecr-pull"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EcrAuth"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Sid    = "EcrPullBackend"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
        ]
        Resource = aws_ecr_repository.backend.arn
      },
    ]
  })
}

# Permisos SES — el backend manda emails por todas las orgs/teams usando
# las credenciales del instance profile (sin Access Keys en .env).
resource "aws_iam_role_policy" "ec2_ses" {
  name = "${var.project}-${var.env}-ec2-ses"
  role = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SesSendEmails"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendBulkEmail",
          "ses:SendRawEmail",
        ]
        Resource = "*"
      },
      {
        Sid    = "SesManageConfigurationSets"
        Effect = "Allow"
        Action = [
          "ses:GetConfigurationSet",
          "ses:CreateConfigurationSet",
          "ses:DescribeConfigurationSet",
          "ses:ListConfigurationSets",
          "ses:CreateConfigurationSetEventDestination",
          "ses:GetConfigurationSetEventDestinations",
          "ses:UpdateConfigurationSetEventDestination",
          "ses:DeleteConfigurationSetEventDestination",
        ]
        Resource = "*"
      },
      {
        Sid    = "SesReadIdentities"
        Effect = "Allow"
        Action = [
          "ses:GetEmailIdentity",
          "ses:ListEmailIdentities",
        ]
        Resource = "*"
      },
      {
        Sid    = "SesManageDomainIdentities"
        Effect = "Allow"
        Action = [
          # Phase 1: registrar/borrar dominios de clientes en SES y leer su
          # status de verificación (DKIM). Sin estas perms no podemos
          # automatizar el alta de dominios desde el panel.
          "ses:CreateEmailIdentity",
          "ses:DeleteEmailIdentity",
          "ses:PutEmailIdentityDkimAttributes",
          "ses:PutEmailIdentityDkimSigningAttributes",
          # Tagging para auditar qué org dueña de cada identity en SES.
          "ses:TagResource",
          "ses:UntagResource",
          "ses:ListTagsForResource",
        ]
        Resource = "*"
      },
      {
        Sid    = "SesGetAccount"
        Effect = "Allow"
        Action = [
          "ses:GetAccount",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.project}-${var.env}-ec2"
  role = aws_iam_role.ec2.name
}
