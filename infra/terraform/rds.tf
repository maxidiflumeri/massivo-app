resource "random_password" "rds" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_subnet_group" "main" {
  name        = "${var.project}-${var.env}"
  description = "Subnets default para RDS de massivo"
  subnet_ids  = data.aws_subnets.default_public.ids

  tags = {
    Name = "${var.project}-${var.env}"
  }
}

resource "aws_db_instance" "main" {
  identifier = "${var.project}-${var.env}"

  engine         = "postgres"
  engine_version = var.rds_engine_version
  instance_class = var.rds_instance_class

  allocated_storage     = var.rds_allocated_storage_gb
  max_allocated_storage = 100 # autoscale hasta 100 GB
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.rds_database_name
  username = var.rds_master_username
  password = random_password.rds.result
  port     = 5432

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false # POC: una sola AZ para ahorrar

  backup_retention_period   = 7
  backup_window             = "03:00-04:00" # UTC
  maintenance_window        = "Mon:04:00-Mon:05:00"
  copy_tags_to_snapshot     = true
  delete_automated_backups  = true
  deletion_protection       = false # POC; cambiar a true cuando vaya en serio
  skip_final_snapshot       = true  # POC; cambiar a false en prod real
  performance_insights_enabled = false

  auto_minor_version_upgrade = true
  apply_immediately          = false

  tags = {
    Name = "${var.project}-${var.env}"
  }
}
