resource "aws_acm_certificate" "frontend" {
  domain_name       = var.frontend_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project}-${var.env}-frontend"
  }
}

resource "aws_acm_certificate_validation" "frontend" {
  certificate_arn = aws_acm_certificate.frontend.arn

  timeouts {
    create = "60m"
  }
}
