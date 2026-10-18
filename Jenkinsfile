pipeline {

    agent any

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

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
                    if errorlevel 1 exit /b 1
                '''
            }
        }

        stage('Frontend Build') {
            steps {
                bat '''
                    set "PATH=C:\\Program Files\\nodejs;%PATH%"

                    echo ===== NODE VERSION =====
                    node --version

                    echo ===== NPM VERSION =====
                    npm --version

                    cd veyora\\frontend

                    echo ===== NPM CI =====
                    npm ci
                    if errorlevel 1 exit /b 1

                    echo ===== NPM BUILD =====
                    npm run build
                    if errorlevel 1 exit /b 1

                    cd ..\\..
                '''
            }
        }

        stage('Validate Docker Compose') {
            steps {
                bat '''
                    set "PATH=C:\\Users\\billi\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin;%PATH%"

                    echo ===== DOCKER VERSION =====
                    docker --version

                    echo ===== DOCKER COMPOSE VERSION =====
                    docker compose version

                    echo ===== DOCKER COMPOSE VALIDATION =====
                    docker compose config --quiet
                    if errorlevel 1 exit /b 1
                '''
            }
        }

        stage('Build Docker Images') {
            steps {
                bat '''
                    set "PATH=C:\\Users\\billi\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin;%PATH%"

                    echo ===== BUILDING BACKEND IMAGE =====
                    docker build -t veyora-ci-pipeline-backend:latest veyora\\backend
                    if errorlevel 1 exit /b 1

                    echo ===== BUILDING FRONTEND IMAGE =====
                    docker build -t veyora-ci-pipeline-frontend:latest veyora\\frontend
                    if errorlevel 1 exit /b 1

                    echo ===== DOCKER IMAGES BUILT =====
                    docker images
                '''
            }
        }

        stage('Trivy Image Scan') {
            steps {
                bat '''
                    if not exist trivy-reports mkdir trivy-reports

                    echo ===== TRIVY VERSION =====
                    "D:\\VEYORA-project\\trivy.exe" --version

                    echo ===== SCANNING FRONTEND IMAGE =====
                    "D:\\VEYORA-project\\trivy.exe" image ^
                        --cache-dir "D:\\TrivyCache" ^
                        --scanners vuln,misconfig,secret ^
                        --format json ^
                        --output "trivy-reports\\frontend-trivy-report.json" ^
                        "veyora-ci-pipeline-frontend:latest"

                    if errorlevel 1 exit /b 1

                    echo ===== SCANNING BACKEND IMAGE =====
                    "D:\\VEYORA-project\\trivy.exe" image ^
                        --cache-dir "D:\\TrivyCache" ^
                        --scanners vuln,misconfig,secret ^
                        --format json ^
                        --output "trivy-reports\\backend-trivy-report.json" ^
                        "veyora-ci-pipeline-backend:latest"

                    if errorlevel 1 exit /b 1

                    echo ===== TRIVY SCAN COMPLETED =====
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

                                if errorlevel 1 exit /b 1

                                echo ===== SONARQUBE SCAN COMPLETED =====
                            """
                        )
                    }
                }
            }
        }
    }

    post {

        always {

            echo '===== ARCHIVING TEST REPORTS ====='

            junit allowEmptyResults: true,
                  testResults: 'veyora/backend/test-results/*.xml'

            echo '===== ARCHIVING TRIVY REPORTS ====='

            archiveArtifacts allowEmptyArchive: true,
                            artifacts: 'trivy-reports/*.json'

            echo '===== VEYORA CI PIPELINE COMPLETED ====='
        }

        success {
            echo 'VEYORA CI pipeline completed successfully.'
        }

        failure {
            echo 'VEYORA CI pipeline failed. Check the console log.'
        }
    }
}