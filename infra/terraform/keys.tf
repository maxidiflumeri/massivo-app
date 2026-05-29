resource "aws_key_pair" "maxi" {
  key_name   = "${var.project}-${var.env}-maxi"
  public_key = file(pathexpand(var.ssh_public_key_path))
}
