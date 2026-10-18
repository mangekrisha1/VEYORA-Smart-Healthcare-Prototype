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

                    echo ===== RUNNING BACKEND TESTS =====
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

                    echo ===== RUNNING NPM CI =====
                    npm ci

                    if errorlevel 1 exit /b 1

                    echo ===== RUNNING FRONTEND BUILD =====
                    npm run build

                    if errorlevel 1 exit /b 1

                    echo ===== FRONTEND BUILD COMPLETED =====

                    if not exist dist (
                        echo ERROR: Frontend dist folder was not created.
                        exit /b 1
                    )

                    echo ===== FRONTEND DIST FOLDER FOUND =====
                    dir dist
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

                    echo ===== DOCKER COMPOSE VALIDATION COMPLETED =====
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

                        withCredentials([
                            string(
                                credentialsId: 'sonarqube-token',
                                variable: 'SONAR_TOKEN'
                            )
                        ]) {

                            bat(
                                script: """
                                    set "JAVA_HOME=C:\\Program Files\\Java\\jdk-25"
                                    set "PATH=%JAVA_HOME%\\bin;%PATH%"

                                    echo ===== JAVA VERSION =====
                                    "%JAVA_HOME%\\bin\\java.exe" -version

                                    echo ===== SONAR SCANNER VERSION =====
                                    call "${scannerHome}\\bin\\sonar-scanner.bat" --version

                                    if errorlevel 1 exit /b 1

                                    echo ===== STARTING SONARQUBE SAST SCAN =====

                                    call "${scannerHome}\\bin\\sonar-scanner.bat" ^
                                        -Dsonar.host.url=http://localhost:9000 ^
                                        -Dsonar.token=%SONAR_TOKEN%

                                    if errorlevel 1 exit /b 1

                                    echo ===== SONARQUBE SCAN COMPLETED =====

if not exist ".scannerwork\report-task.txt" (
    echo ERROR: SonarQube .scannerwork\report-task.txt was not created.
    exit /b 1
)

echo ===== SONARQUBE REPORT FOUND =====
dir ".scannerwork\report-task.txt"
                            )
                        }
                    }
                }
            }
        }
    }

    post {

        always {
            echo '===== ARCHIVING TEST REPORTS ====='

            junit(
                testResults: '**/test-results/**/*.xml',
                allowEmptyResults: true
            )

            echo '===== ARCHIVING TRIVY REPORTS ====='

            archiveArtifacts(
                artifacts: 'trivy-reports/*.json',
                allowEmptyArchive: true
            )
        }

        success {
            echo '===== VEYORA CI PIPELINE COMPLETED ====='
            echo 'VEYORA CI pipeline completed successfully.'
        }

        failure {
            echo '===== VEYORA CI PIPELINE FAILED ====='
            echo 'VEYORA CI pipeline failed. Check the console log.'
        }
    }
}
