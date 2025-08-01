import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const clientId = process.env.CLIENT_ID || 'openmarket';
const targetDir = process.env.TARGET_DIR || 'openmarket';
const apiBaseUrl = process.env.API_URL || 'http://localhost:80';
const sampleFileFolder = `./${targetDir}/uploadFiles`;



// API 호출을 위한 헤더 설정
const getHeaders = () => ({
  'client-id': clientId,
  'Content-Type': 'application/json'
});

// API 호출을 위한 공통 함수
async function apiCall(endpoint, method = 'GET', data = null, isFormData = false) {
  const url = `${apiBaseUrl}${endpoint}`;
  const options = {
    method,
    headers: isFormData ? { 
      'client-id': clientId,
      // FormData의 경우 Content-Type을 설정하지 않으면 브라우저가 자동으로 설정하지만
      // Node.js에서는 명시적으로 설정해야 할 수 있음
    } : getHeaders()
  };

  if (data) {
    if (isFormData) {
      options.body = data;
      // FormData의 경우 Content-Type을 자동으로 설정하도록 함
    } else {
      options.body = JSON.stringify(data);
    }
  }

  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 호출 실패 ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`API 호출 오류 [${method} ${endpoint}]:`, error.message);
    throw error;
  }
}



async function initDB() {
  // 실제 uploadFiles 폴더의 파일 목록 가져오기
  const fs = await import('node:fs');
  const actualFiles = fs.readdirSync(sampleFileFolder)
    .filter(file => !file.startsWith('.')) // 숨김 파일 제외
    .filter(file => fs.statSync(`${sampleFileFolder}/${file}`).isFile()); // 파일만
  
  console.log(`uploadFiles 폴더의 실제 파일: ${actualFiles.length}개`);
  actualFiles.forEach(file => {
    console.log(`  ${file}`);
  });
  
  // FormData로 파일 전송
  const formData = new FormData();
  
  // data.json 파일 추가
  const dataJsonPath = `./${targetDir}/data.json`;
  const dataJsonBuffer = fs.readFileSync(dataJsonPath);
  const dataJsonBlob = new Blob([dataJsonBuffer]);
  formData.append('initData', dataJsonBlob);
  
  // uploadFiles 폴더의 파일들 추가
  for (const filename of actualFiles) {
    const filePath = `${sampleFileFolder}/${filename}`;
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);
    formData.append('attach', blob, filename);
  }
  
  // 서버의 dbinit API 호출
  const result = await apiCall('/db/init', 'POST', formData, true);
  
     if (result.ok) {
     console.log('\nDB 초기화 결과');
     console.log(`등록된 데이터: ${result.data.insertedData}건`);
     
     if (result.data.details) {
       for (const [collection, count] of Object.entries(result.data.details)) {
         console.log(`  ${collection}: ${count}건`);
       }
     }
     
     
     
           if (result.files) {
        console.log('\n파일 업로드 결과');
        console.log(`전체 파일: ${result.files.count}개`);
        
        if (result.files.success && result.files.success.count > 0) {
          console.log(`업로드된 파일: ${result.files.success.count}개`);
                              if (result.files.success.details && result.files.success.details.length > 0) {
                      result.files.success.details.forEach(filename => {
                        console.log(`  ${filename}`);
                      });
                    }
        }
        
        if (result.files.missing && result.files.missing.count > 0) {
          console.log(`\n첨부되지 않은 파일: ${result.files.missing.count}개`);
          console.log(`사유: ${result.files.missing.reason}`);
          if (result.files.missing.details && result.files.missing.details.length > 0) {
            result.files.missing.details.forEach(filename => {
              console.log(`  ${filename}`);
            });
          }
        }
        
        if (result.files.unused && result.files.unused.count > 0) {
          console.log(`\n사용하지 않는 파일: ${result.files.unused.count}개`);
          console.log(`사유: ${result.files.unused.reason}`);
          if (result.files.unused.details && result.files.unused.details.length > 0) {
            result.files.unused.details.forEach(filename => {
              console.log(`  ${filename}`);
            });
          }
        }
      }
  } else {
    console.error('서버 dbinit 실패');
  }
}

// 메인 실행
console.log(`등록할 데이터: ${targetDir}/data.js`);
console.log(`업로드할 폴더: ${targetDir}/uploadFiles`);
console.log(`API 서버 주소: ${apiBaseUrl}`);
console.log(`client-id: ${clientId}`);

try {
  console.log('DB 초기화 시작...');
  await initDB();
  console.info('DB 초기화 완료.');
} catch (error) {
  console.error('DB 초기화 중 오류 발생:', error);
  process.exit(1);
}


