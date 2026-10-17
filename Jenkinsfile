pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 25, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                echo 'Source code checked out from GitHub.'
            }
        }

        stage('Backend Tests') {
            steps {
                bat '''
                    if not exist reports mkdir reports

                    "C:\\Program Files\\Python314\\python.exe" -m venv .ci-venv
                    if errorlevel 1 exit /b %errorlevel%

                    .ci-venv\\Scripts\\python.exe -m pip install --upgrade pip
                    if errorlevel 1 exit /b %errorlevel%

                    .ci-venv\\Scripts\\python.exe -m pip install -r veyora\\backend\\requirements.txt
                    if errorlevel 1 exit /b %errorlevel%

                    .ci-venv\\Scripts\\python.exe -m pytest veyora\\backend\\tests --basetemp veyora\\backend\\.pytest-ci-tmp --junitxml=reports\\backend-junit.xml
                '''
            }
        }

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

        stage('Build Docker Images') {
            steps {
                bat 'docker compose build'
            }
        }
    }

    post {
        always {
            junit testResults: 'reports/backend-junit.xml',
                  allowEmptyResults: true

            archiveArtifacts artifacts: 'reports/**,veyora/frontend/dist/**',
                             allowEmptyArchive: true
        }

        success {
            echo 'VEYORA CI pipeline completed successfully.'
        }

        failure {
            echo 'Pipeline failed. Check the stage logs to identify the issue.'
        }
    }
}