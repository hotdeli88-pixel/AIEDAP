// IndexedDB 관리 모듈
const DBManager = {
    db: null,
    dbName: 'AIEDAP',
    dbVersion: 1,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                reject(new Error('IndexedDB 열기 실패'));
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 학생 정보 저장소
                if (!db.objectStoreNames.contains('students')) {
                    const studentStore = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
                    studentStore.createIndex('name', 'name', { unique: false });
                }

                // 프로젝트 저장소
                if (!db.objectStoreNames.contains('projects')) {
                    const projectStore = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
                    projectStore.createIndex('studentName', 'studentName', { unique: false });
                    projectStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // 버전 히스토리 저장소
                if (!db.objectStoreNames.contains('versions')) {
                    const versionStore = db.createObjectStore('versions', { keyPath: 'id', autoIncrement: true });
                    versionStore.createIndex('projectId', 'projectId', { unique: false });
                    versionStore.createIndex('createdAt', 'createdAt', { unique: false });
                }
            };
        });
    },

    async ensureDB() {
        if (!this.db) {
            await this.init();
        }
        return this.db;
    },

    // 학생 정보 저장
    async saveStudent(studentData) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['students'], 'readwrite');
            const store = transaction.objectStore('students');
            
            // 기존 학생 확인
            const index = store.index('name');
            const request = index.get(studentData.name);

            request.onsuccess = () => {
                if (request.result) {
                    // 기존 학생 업데이트
                    const student = { ...request.result, ...studentData };
                    const updateRequest = store.put(student);
                    updateRequest.onsuccess = () => resolve(student);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    // 새 학생 추가
                    const addRequest = store.add(studentData);
                    addRequest.onsuccess = () => resolve({ ...studentData, id: addRequest.result });
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };

            request.onerror = () => reject(request.error);
        });
    },

    // 프로젝트 저장
    async saveProject(projectData) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            
            if (projectData.id) {
                // 업데이트
                const updateRequest = store.put(projectData);
                updateRequest.onsuccess = () => resolve(projectData);
                updateRequest.onerror = () => reject(updateRequest.error);
            } else {
                // 새 프로젝트 추가
                projectData.createdAt = new Date().toISOString();
                projectData.status = 'pending'; // pending, approved, rejected, completed
                const addRequest = store.add(projectData);
                addRequest.onsuccess = () => {
                    resolve({ ...projectData, id: addRequest.result });
                };
                addRequest.onerror = () => reject(addRequest.error);
            }
        });
    },

    // 프로젝트 조회 (학생별)
    async getProjectsByStudent(studentName) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const index = store.index('studentName');
            const request = index.getAll(studentName);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    // 모든 프로젝트 조회
    async getAllProjects() {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    // 프로젝트 ID로 조회
    async getProjectById(projectId) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.get(projectId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // 버전 히스토리 저장
    async saveVersion(versionData) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['versions'], 'readwrite');
            const store = transaction.objectStore('versions');
            
            versionData.createdAt = new Date().toISOString();
            const addRequest = store.add(versionData);
            addRequest.onsuccess = () => {
                resolve({ ...versionData, id: addRequest.result });
            };
            addRequest.onerror = () => reject(addRequest.error);
        });
    },

    // 프로젝트의 버전 히스토리 조회
    async getVersionsByProject(projectId) {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['versions'], 'readonly');
            const store = transaction.objectStore('versions');
            const index = store.index('projectId');
            const request = index.getAll(projectId);

            request.onsuccess = () => {
                const versions = request.result || [];
                // 날짜순 정렬 (최신순)
                versions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                resolve(versions);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // 승인 대기 중인 프로젝트 조회
    async getPendingProjects() {
        const db = await this.ensureDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['projects'], 'readonly');
            const store = transaction.objectStore('projects');
            const request = store.getAll();

            request.onsuccess = () => {
                const projects = (request.result || []).filter(p => p.status === 'pending');
                resolve(projects);
            };
            request.onerror = () => reject(request.error);
        });
    },

    // 프로젝트 상태 업데이트
    async updateProjectStatus(projectId, status) {
        const db = await this.ensureDB();
        return new Promise(async (resolve, reject) => {
            const project = await this.getProjectById(projectId);
            if (!project) {
                reject(new Error('프로젝트를 찾을 수 없습니다'));
                return;
            }

            project.status = status;
            project.updatedAt = new Date().toISOString();

            const transaction = db.transaction(['projects'], 'readwrite');
            const store = transaction.objectStore('projects');
            const request = store.put(project);

            request.onsuccess = () => resolve(project);
            request.onerror = () => reject(request.error);
        });
    }
};

// DB 초기화
DBManager.init().catch(console.error);

