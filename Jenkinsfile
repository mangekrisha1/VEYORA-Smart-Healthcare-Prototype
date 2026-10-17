pipeline {
    agent any

    stages {

        stage('Backend Tests') {
            steps {
                bat '''
                    if not exist .ci-venv (
                        py -3 -m venv .ci-venv
                    )

                    call .ci-venv\\Scripts\\activate.bat

                    python -m pip install --upgrade pip
                    pip install -r veyora\\backend\\requirements.txt

                    cd veyora\\backend

                    python -m pytest -q

                    cd ..\\..
                '''
            }
        }

        stage('Frontend Build') {
            steps {
                bat '''
                    cd veyora\\frontend

                    npm ci
                    npm run build

                    cd ..\\..
                '''
            }
        }

        stage('SonarQube SAST Scan') {
            steps {
                script {
                    def scannerHome = tool name: 'SonarScanner'

                    withSonarQubeEnv('SonarQube') {
                        bat(
                            script: """
                                set "JAVA_HOME=C:\\Program Files\\Java\\jdk-25"
                                set "PATH=%JAVA_HOME%\\bin;%PATH%"

                                echo ===== JAVA VERSION =====
                                "%JAVA_HOME%\\bin\\java.exe" -version

                                echo ===== SONAR SCANNER VERSION =====
                                "${scannerHome}\\bin\\sonar-scanner.bat" --version

                                echo ===== STARTING SONARQUBE SAST SCAN =====
                                "${scannerHome}\\bin\\sonar-scanner.bat" -Dsonar.host.url=http://localhost:9000

                                echo ===== SONARQUBE SCAN COMPLETED =====
                            """
                        )
                    }
                }
            }
        }

        stage('Validate Docker Compose') {
            steps {
                bat '''
                    docker compose config --quiet
                '''
            }
        }

        stage('Build Docker Images') {
            steps {
                bat '''
                    docker compose build
                '''
            }
        }
    }

    post {
        always {
            junit allowEmptyResults: true,
                  testResults: 'veyora/backend/test-results/*.xml'

            archiveArtifacts allowEmptyArchive: true,
                    artifacts: 'veyora/backend/test-results/*.xml'
        }

        success {
            echo 'VEYORA CI pipeline completed successfully.'
        }

        failure {
            echo 'VEYORA CI pipeline failed.'
        }
    }
}