data "aws_ami" "ubuntu_arm64" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

resource "aws_instance" "api" {
  ami                         = data.aws_ami.ubuntu_arm64.id
  instance_type               = var.ec2_instance_type
  subnet_id                   = data.aws_subnets.default_public.ids[0]
  vpc_security_group_ids      = [aws_security_group.ec2.id]
  key_name                    = aws_key_pair.maxi.key_name
  associate_public_ip_address = true

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.ec2_root_volume_gb
    encrypted             = true
    delete_on_termination = true
  }

  metadata_options {
    http_tokens                 = "required" # IMDSv2 obligatorio
    http_put_response_hop_limit = 2
  }

  tags = {
    Name = "${var.project}-${var.env}-api"
  }
}

resource "aws_eip" "api" {
  domain   = "vpc"
  instance = aws_instance.api.id

  tags = {
    Name = "${var.project}-${var.env}-api"
  }
}
