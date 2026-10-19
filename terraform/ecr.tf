resource "aws_ecr_repository" "veyora" {
  name         = "veyora"
  force_delete = true
}

output "ecr_url" {
  value = aws_ecr_repository.veyora.repository_url
}
