# OIDC trust entre GitHub Actions y AWS.
# Permite que workflows del repo asuman un role de AWS sin necesidad de Access
# Keys hardcodeadas en GitHub Secrets. El token JWT que GitHub firma se
# valida contra este provider en STS.

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = var.github_oidc_thumbprints
}

resource "aws_iam_role" "github_actions" {
  name = "${var.project}-${var.env}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        # Scope al repo + cualquier branch/tag/PR. Si quisiéramos restringir
        # a solo refs/heads/main, sería "repo:owner/repo:ref:refs/heads/main".
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
      }
    }]
  })

  tags = {
    Name = "${var.project}-${var.env}-github-actions"
  }
}

resource "aws_iam_role_policy" "github_actions" {
  name = "${var.project}-${var.env}-github-actions"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # ECR — push de imágenes del backend
      {
        Sid    = "EcrAuth"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
        ]
        Resource = "*"
      },
      {
        Sid    = "EcrPushBackend"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage",
        ]
        Resource = aws_ecr_repository.backend.arn
      },
      # SSM — ejecutar comandos en la EC2 para hacer el `docker pull && up`
      {
        Sid    = "SsmSendCommand"
        Effect = "Allow"
        Action = [
          "ssm:SendCommand",
        ]
        Resource = [
          "arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/${aws_instance.api.id}",
          "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
        ]
      },
      {
        Sid    = "SsmGetInvocation"
        Effect = "Allow"
        Action = [
          "ssm:GetCommandInvocation",
          "ssm:ListCommandInvocations",
        ]
        Resource = "*"
      },
      # S3 — sync de panel, landing y docs
      {
        Sid    = "S3Sync"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ]
        Resource = [
          aws_s3_bucket.frontend.arn,
          "${aws_s3_bucket.frontend.arn}/*",
          aws_s3_bucket.landing.arn,
          "${aws_s3_bucket.landing.arn}/*",
          aws_s3_bucket.docs.arn,
          "${aws_s3_bucket.docs.arn}/*",
        ]
      },
      # CloudFront — invalidaciones post-deploy
      {
        Sid    = "CloudFrontInvalidate"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation",
        ]
        Resource = [
          aws_cloudfront_distribution.frontend.arn,
          aws_cloudfront_distribution.landing.arn,
          aws_cloudfront_distribution.docs.arn,
        ]
      },
    ]
  })
}
