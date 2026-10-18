output "instance_public_ip" {
  description = "Public IP address of VEYORA EC2"
  value       = aws_instance.veyora.public_ip
}

output "instance_public_dns" {
  description = "Public DNS name of VEYORA EC2"
  value       = aws_instance.veyora.public_dns
}

output "frontend_url" {
  description = "VEYORA frontend URL"
  value       = "http://${aws_instance.veyora.public_ip}:5173"
}

output "backend_url" {
  description = "VEYORA backend URL"
  value       = "http://${aws_instance.veyora.public_ip}:5000"
}