# Infra para la landing marketing — massivo.app + www.massivo.app.
# Separada del panel.massivo.app para que el bundle marketing no comparta
# bloat con la app, deploys independientes, y SEO/Lighthouse separados.

# ============================================================
# S3 bucket
# ============================================================
resource "aws_s3_bucket" "landing" {
  bucket = "${var.project}-${var.env}-landing-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${var.project}-${var.env}-landing"
  }
}

resource "aws_s3_bucket_ownership_controls" "landing" {
  bucket = aws_s3_bucket.landing.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "landing" {
  bucket                  = aws_s3_bucket.landing.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "landing" {
  bucket = aws_s3_bucket.landing.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ============================================================
# ACM cert — multi-SAN: apex + www
# ============================================================
resource "aws_acm_certificate" "landing" {
  domain_name               = var.landing_apex_domain
  subject_alternative_names = [var.landing_www_domain]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project}-${var.env}-landing"
  }
}

resource "aws_acm_certificate_validation" "landing" {
  certificate_arn = aws_acm_certificate.landing.arn

  timeouts {
    create = "60m"
  }
}

# ============================================================
# CloudFront
# ============================================================
resource "aws_cloudfront_origin_access_control" "landing" {
  name                              = "${var.project}-${var.env}-landing"
  description                       = "OAC para CloudFront → S3 landing"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "landing" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project}-${var.env} landing"
  default_root_object = "index.html"
  aliases             = [var.landing_apex_domain, var.landing_www_domain]
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.landing.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.landing.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.landing.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${aws_s3_bucket.landing.id}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  }

  # SPA fallback — la landing es client-side routing (si en el futuro suma
  # /pricing, /features como rutas React)
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.landing.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = {
    Name = "${var.project}-${var.env}-landing"
  }
}

resource "aws_s3_bucket_policy" "landing_cloudfront" {
  bucket = aws_s3_bucket.landing.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.landing.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.landing.arn
          }
        }
      }
    ]
  })
}
