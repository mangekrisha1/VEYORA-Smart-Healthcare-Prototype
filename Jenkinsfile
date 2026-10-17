stage('Frontend Build') {
    steps {
        dir('veyora/frontend') {
            bat 'npm ci'
            bat 'npm run build'
        }
    }
}

stage('SonarQube SAST Scan') {
    steps {
        withSonarQubeEnv('SonarQube') {
            bat "${tool 'SonarScanner'}\\bin\\sonar-scanner.bat"
        }
    }
}

stage('Validate Docker Compose') {
    steps {
        bat 'docker compose config --quiet'
    }
}