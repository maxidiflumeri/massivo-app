# Infra para la documentación pública — docs.massivo.app.
# Mismo patrón que landing.tf (S3 + OAC + CloudFront + ACM), pero:
#   - Single SAN (sólo docs.massivo.app, sin www)
#   - SPA fallback NO necesario (Docusaurus genera HTML estático con rutas
#     prerendered), pero igual lo dejamos por si se rompe un link interno.

# ============================================================
# S3 bucket
# ============================================================
resource "aws_s3_bucket" "docs" {
  bucket = "${var.project}-${var.env}-docs-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${var.project}-${var.env}-docs"
  }
}

resource "aws_s3_bucket_ownership_controls" "docs" {
  bucket = aws_s3_bucket.docs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "docs" {
  bucket                  = aws_s3_bucket.docs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "docs" {
  bucket = aws_s3_bucket.docs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ============================================================
# ACM cert — docs.massivo.app (single SAN)
# ============================================================
resource "aws_acm_certificate" "docs" {
  domain_name       = var.docs_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project}-${var.env}-docs"
  }
}

resource "aws_acm_certificate_validation" "docs" {
  certificate_arn = aws_acm_certificate.docs.arn

  timeouts {
    create = "60m"
  }
}

# ============================================================
# CloudFront
# ============================================================
resource "aws_cloudfront_origin_access_control" "docs" {
  name                              = "${var.project}-${var.env}-docs"
  description                       = "OAC para CloudFront → S3 docs"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "docs" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project}-${var.env} docs"
  default_root_object = "index.html"
  aliases             = [var.docs_domain]
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.docs.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.docs.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.docs.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${aws_s3_bucket.docs.id}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  }

  # Fallback a 404.html que genera Docusaurus. Si pidiendo /algo-que-no-existe
  # devolvemos el 404 nativo del site (no el genérico de CloudFront).
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.docs.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name = "${var.project}-${var.env}-docs"
  }
}

resource "aws_s3_bucket_policy" "docs_cloudfront" {
  bucket = aws_s3_bucket.docs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.docs.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.docs.arn
          }
        }
      }
    ]
  })
}
