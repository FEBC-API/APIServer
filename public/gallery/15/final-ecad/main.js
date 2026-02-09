import teaminfo from './teaminfo.js';

const projectCardsContainer = document.getElementById('project-cards');

// OG 이미지를 가져오는 함수
async function fetchOgImage(url) {
  try {
    // 서버의 로컬 프록시 (/proxy) 사용
    const response = await fetch('/proxy', {
      headers: {
        'x-target-url': url
      }
    });
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // 임시 DOM 파서로 og:image 태그 찾기
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
    
    // 상대 경로인 경우 절대 경로로 변환
    if (ogImage && !ogImage.startsWith('http')) {
      const baseUrl = new URL(url);
      return new URL(ogImage, baseUrl.origin).href;
    }
    
    return ogImage;
  } catch (error) {
    console.error('이미지 로드 실패:', url, error);
    return null;
  }
}

if (projectCardsContainer) {
  // 팀 정보를 순차적으로 처리하여 이미지 로드
  teaminfo.teams.forEach(async (team) => {
    const card = document.createElement('div');
    card.className = 'col-md-6 col-lg-4';
    
    card.innerHTML = `
      <div class="card ${team.deployUrl ? 'clickable-card' : ''}" data-deploy-url="${team.deployUrl || ''}">
        <div class="position-relative">
          <div class="project-header" id="header-${team.id}" style="background: linear-gradient(135deg, #FFF5F0, #FFEEE5); transition: all 0.5s ease;">
            <h3 class="project-name" id="name-${team.id}">${team.projectName}</h3>
          </div>
          <span class="team-badge">${team.id}조 - ${team.name}</span>
        </div>
        <div class="card-body d-flex flex-column">
          <h5 class="card-title fw-bold">${team.projectName}</h5>
          <div class="project-topic mb-3">${team.projectTopic || '프로젝트 설명이 없습니다.'}</div>
          <div class="team-members mt-auto mb-1">
            <div><strong>팀장:</strong> ${team.leader}</div>
            <div><strong>팀원:</strong> ${team.members.map(member => `${member.name}(${member.role})`).join(', ')}</div>
          </div>
          <div class="project-links pt-1">
            <a href="${team.deployUrl || '#'}" target="_blank" class="btn btn-outline-secondary btn-sm ${!team.deployUrl ? 'disabled' : ''}" onclick="event.stopPropagation();">
              <i class="bi bi-globe"></i> Demo
            </a>
            <a href="${team.githubLink || '#'}" target="_blank" class="btn btn-outline-secondary btn-sm ${!team.githubLink ? 'disabled' : ''}" onclick="event.stopPropagation();">
              <i class="bi bi-github"></i> GitHub
            </a>
            <a href="${team.notionLink || '#'}" target="_blank" class="btn btn-outline-secondary btn-sm ${!team.notionLink ? 'disabled' : ''}" onclick="event.stopPropagation();">
              <i class="bi bi-file-earmark-text"></i> Notion
            </a>
            <a href="${team.figmaLink || '#'}" target="_blank" class="btn btn-outline-secondary btn-sm ${!team.figmaLink ? 'disabled' : ''}" onclick="event.stopPropagation();">
              <i class="bi bi-vector-pen"></i> Figma
            </a>
          </div>
        </div>
      </div>
    `;
    
    projectCardsContainer.appendChild(card);

    // 카드 클릭 이벤트 추가
    const cardElement = card.querySelector('.card');
    if (cardElement && team.deployUrl) {
      cardElement.addEventListener('click', (e) => {
        if (!e.target.closest('.project-links')) {
          window.open(team.deployUrl, '_blank');
        }
      });
    }

    // 동적으로 OG 이미지 가져와서 배경으로 설정
    if (team.deployUrl) {
      const ogImageUrl = await fetchOgImage(team.deployUrl);
      if (ogImageUrl) {
        const header = document.getElementById(`header-${team.id}`);
        const nameText = document.getElementById(`name-${team.id}`);
        
        if (header) {
          header.style.backgroundImage = `url('${ogImageUrl}')`;
          header.style.backgroundSize = 'cover';
          header.style.backgroundPosition = 'center';
          header.style.backgroundColor = 'transparent'; // 기본 배경색 제거
          header.style.backgroundBlendMode = 'normal';   // 블렌드 모드 제거
          header.style.filter = 'none';                  // 필터 제거 (원본 선명도 유지)
        }
        if (nameText) {
          nameText.style.display = 'none'; // 이미지가 있으므로 텍스트 생략
        }
      }
    }
  });
}
