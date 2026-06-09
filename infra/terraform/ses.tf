# SNS topic platform-wide para eventos de SES (bounce, complaint,
# delivery, open, click). Único topic compartido por todos los teams; el
# backend rutea cada evento al team correspondiente leyendo el nombre del
# configurationSet que viene en el payload.
#
# Cuando SES emite un evento contra un configurationSet de un team, la
# config tiene como event destination este SNS topic. El topic publica al
# webhook HTTPS del backend.

resource "aws_sns_topic" "ses_events" {
  name = "${var.project}-${var.env}-ses-events"

  tags = {
    Name = "${var.project}-${var.env}-ses-events"
  }
}

# Topic policy: permite que cualquier configurationSet de SES de esta
# cuenta publique eventos al topic. La validación de "qué config set"
# la hace el backend leyendo el payload.
resource "aws_sns_topic_policy" "ses_events" {
  arn = aws_sns_topic.ses_events.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowSesPublish"
      Effect    = "Allow"
      Principal = { Service = "ses.amazonaws.com" }
      Action    = "sns:Publish"
      Resource  = aws_sns_topic.ses_events.arn
      Condition = {
        StringEquals = {
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })
}

# Suscripción HTTPS al webhook del backend.
# El backend (ses-webhook.controller.ts) maneja automáticamente la
# SubscriptionConfirmation haciendo fetch al SubscribeURL — no hace falta
# confirmar a mano.
resource "aws_sns_topic_subscription" "ses_events_backend" {
  topic_arn              = aws_sns_topic.ses_events.arn
  protocol               = "https"
  endpoint               = "https://${var.api_domain}/api/webhooks/ses"
  endpoint_auto_confirms = true
}
