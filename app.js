const root = document.documentElement;
const previewContainer = document.getElementById('preview-container');
const textInput = document.getElementById('text-input');
const pageSizeSelect = document.getElementById('page-size');
const themeSelect = document.getElementById('theme-select');
const fontSelect = document.getElementById('font-select');
const brandColorInput = document.getElementById('brand-color');
const coverToggle = document.getElementById('cover-toggle');
const watermarkToggle = document.getElementById('watermark-toggle');
const pageNumberToggle = document.getElementById('page-number-toggle');
const watermarkTextInput = document.getElementById('watermark-text');
const refreshButton = document.getElementById('refresh-button');
const exportButton = document.getElementById('export-png');
const downloadZipButton = document.getElementById('download-zip');

const FONT_STACKS = {
  system:
    "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'Source Han Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif:
    "'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', 'Times New Roman', serif",
  rounded:
    "'SF Pro Rounded', 'Lantinghei SC', 'ZCOOL Round Gothic', 'Noto Sans SC', sans-serif",
  mono:
    "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Noto Sans Mono CJK SC', monospace",
};

const DEFAULT_TEXT = `未来城市观察
洞察报告 2024

引言
科技浪潮推动城市治理持续革新，未来的城市将更智慧、更绿色、更宜居。本报告聚焦未来十年内值得关注的趋势与实践样本。

智能交通升级
自动驾驶、车路协同与多模态交通枢纽共同构成智慧出行新格局。多地试点的“分钟级”公共交通响应率，正在重塑居民的出行体验。

公共服务云化
医疗、教育与政务的在线化能力持续增强。普惠、低门槛的数字公共服务，正成为衡量城市韧性的关键指标。

可持续生活方式
零碳社区、低碳建筑与循环经济生态圈，引导市民在衣食住行中践行环保理念。以社区为单位的“碳积分”机制已经在部分城市落地。

总结
未来城市建设是一场长期赛。唯有坚持以人为本、以数据驱动决策，才能在下一阶段竞争中占据优势。`;

function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function parsePageSize(value) {
  const [width, height] = value.split('x').map((item) => parseInt(item, 10));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: 1080, height: 1440 };
  }
  return { width, height };
}

function computePreviewScale(width) {
  const target = 320;
  const scale = target / width;
  return Math.max(0.18, Math.min(0.42, Number(scale.toFixed(2))));
}

function applyPageSize(value) {
  const { width, height } = parsePageSize(value);
  root.style.setProperty('--page-width', `${width}px`);
  root.style.setProperty('--page-height', `${height}px`);
  root.style.setProperty('--preview-scale', computePreviewScale(width));
}

function applyFont(fontKey) {
  const stack = FONT_STACKS[fontKey] || FONT_STACKS.system;
  root.style.setProperty('--active-font', stack);
}

function colorWithAlpha(hex, alpha = 0.12) {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length !== 3 && normalized.length !== 6) {
    return hex;
  }
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;
  const alphaHex = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${expanded}${alphaHex}`;
}

function applyBrandColor(color) {
  root.style.setProperty('--brand-primary', color);
  root.style.setProperty('--brand-bg', colorWithAlpha(color, 0.14));
}

function parseInput(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let coverTitle = '';
  let coverSubtitle = '';
  let titleIndex = -1;
  let subtitleIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (coverTitle.length === 0) {
      coverTitle = trimmed;
      titleIndex = i;
    } else if (coverSubtitle.length === 0) {
      coverSubtitle = trimmed;
      subtitleIndex = i;
      break;
    }
  }

  const sanitized = lines.map((line, index) => {
    if (index === titleIndex || index === subtitleIndex) {
      return '';
    }
    return line;
  });

  const sanitizedText = sanitized.join('\n').trim();
  const sectionBlocks = sanitizedText
    ? sanitizedText
        .split(/\n\s*\n+/)
        .map((block) => block.trim())
        .filter(Boolean)
    : [];

  const sections = sectionBlocks.map((block, blockIndex) => {
    const blockLines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (blockLines.length === 0) {
      return null;
    }

    let title = blockLines[0];
    let subtitle = '';
    let bodyStartIndex = 1;

    if (blockLines.length >= 3) {
      subtitle = blockLines[1];
      bodyStartIndex = 2;
    } else if (blockLines.length === 2 && blockLines[1].length <= 18) {
      subtitle = blockLines[1];
      bodyStartIndex = 2;
    }

    const paragraphs = blockLines.slice(bodyStartIndex);
    if (!paragraphs.length) {
      paragraphs.push('');
    }

    return {
      title: title || `第${blockIndex + 1}部分`,
      subtitle,
      paragraphs,
    };
  });

  const validSections = sections.filter((item) => item !== null);

  if (!validSections.length && coverTitle) {
    validSections.push({
      title: coverTitle,
      subtitle: coverSubtitle,
      paragraphs: [''],
    });
  }

  return {
    coverTitle,
    coverSubtitle,
    sections: validSections,
  };
}

function buildPageSkeleton(themeClass) {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';

  const page = document.createElement('div');
  page.className = `preview-page ${themeClass}`;

  const content = document.createElement('div');
  content.className = 'preview-content';

  const header = document.createElement('header');
  const titleEl = document.createElement('h3');
  titleEl.className = 'page-title';
  header.appendChild(titleEl);

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'page-subtitle';
  header.appendChild(subtitleEl);

  content.appendChild(header);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'preview-body';
  content.appendChild(bodyEl);

  const footer = document.createElement('div');
  footer.className = 'page-footer';
  const footerLeft = document.createElement('span');
  footerLeft.className = 'footer-left';
  const footerRight = document.createElement('span');
  footerRight.className = 'footer-right';
  footer.appendChild(footerLeft);
  footer.appendChild(footerRight);
  content.appendChild(footer);

  page.appendChild(content);
  wrapper.appendChild(page);

  return {
    wrapper,
    page,
    content,
    header,
    titleEl,
    subtitleEl,
    bodyEl,
    footer,
    footerLeft,
    footerRight,
  };
}

function isOverflow(pageEl) {
  const content = pageEl.querySelector('.preview-content');
  if (!content) return false;
  return content.scrollHeight - content.clientHeight > 1;
}

function forceFitParagraph(text, bodyEl, pageEl) {
  const trimmed = text.trim();
  if (!trimmed) {
    const empty = document.createElement('p');
    empty.innerHTML = '&nbsp;';
    bodyEl.appendChild(empty);
    return { fitted: '', remainder: '' };
  }

  const content = pageEl.querySelector('.preview-content');
  const temp = document.createElement('p');
  temp.style.visibility = 'hidden';
  temp.style.position = 'absolute';
  temp.style.pointerEvents = 'none';
  bodyEl.appendChild(temp);

  const chars = Array.from(trimmed);
  let composed = '';
  let lastValidText = '';
  let lastValidIndex = 0;
  let lastBreakText = '';
  let lastBreakIndex = 0;
  let overflowed = false;

  for (let i = 0; i < chars.length; i += 1) {
    composed += chars[i];
    temp.textContent = composed;
    if (content.scrollHeight - content.clientHeight > 1) {
      overflowed = true;
      break;
    }
    lastValidText = composed;
    lastValidIndex = i + 1;
    if (/[。！？；?!,，、]/u.test(chars[i])) {
      lastBreakText = composed;
      lastBreakIndex = i + 1;
    }
  }

  bodyEl.removeChild(temp);

  if (!overflowed) {
    const paragraph = document.createElement('p');
    paragraph.textContent = trimmed;
    bodyEl.appendChild(paragraph);
    return { fitted: trimmed, remainder: '' };
  }

  let fitIndex = lastBreakIndex || lastValidIndex;
  let fitText = (lastBreakIndex ? lastBreakText : lastValidText).trimEnd();

  if (!fitText) {
    fitIndex = Math.max(1, lastValidIndex);
    fitText = chars.slice(0, fitIndex).join('');
  }

  const paragraph = document.createElement('p');
  paragraph.textContent = fitText;
  bodyEl.appendChild(paragraph);

  if (isOverflow(pageEl)) {
    bodyEl.removeChild(paragraph);
    return { fitted: '', remainder: trimmed };
  }

  const remainder = chars.slice(fitIndex).join('').trimStart();
  return { fitted: fitText, remainder };
}

function paginateSection(section, sectionIndex, themeClass) {
  const pages = [];
  const queue = [...section.paragraphs];
  if (!queue.length) {
    queue.push('');
  }

  let pageIndex = 0;

  while (queue.length) {
    const skeleton = buildPageSkeleton(themeClass);
    const { wrapper, page, titleEl, subtitleEl, bodyEl, footer } = skeleton;

    titleEl.textContent = section.title || `第${sectionIndex + 1}部分`;
    const subtitleText =
      pageIndex === 0
        ? section.subtitle
        : section.subtitle
        ? `${section.subtitle} · 续篇`
        : '续篇';

    if (subtitleText) {
      subtitleEl.textContent = subtitleText;
      subtitleEl.style.display = '';
    } else {
      subtitleEl.textContent = '';
      subtitleEl.style.display = 'none';
    }

    while (queue.length) {
      let paragraph = queue.shift();
      if (typeof paragraph !== 'string') {
        paragraph = String(paragraph ?? '');
      }
      const paragraphEl = document.createElement('p');
      paragraphEl.textContent = paragraph.trim();
      bodyEl.appendChild(paragraphEl);

      if (isOverflow(page)) {
        bodyEl.removeChild(paragraphEl);
        const { fitted, remainder } = forceFitParagraph(paragraph, bodyEl, page);
        if (fitted) {
          if (remainder) {
            queue.unshift(remainder);
          }
        } else {
          queue.unshift(paragraph);
          break;
        }
      }
    }

    if (!bodyEl.children.length) {
      // 避免空页循环
      break;
    }

    pages.push({
      wrapper,
      page,
      footer,
      sectionTitle: section.title,
      sectionIndex,
      pageIndex,
    });

    if (!queue.length) {
      break;
    }

    pageIndex += 1;
  }

  return pages;
}

function createCoverPage(title, subtitle, themeClass) {
  const skeleton = buildPageSkeleton(themeClass);
  const { wrapper, page, titleEl, subtitleEl, bodyEl, footer } = skeleton;
  page.classList.add('is-cover');
  titleEl.textContent = title;
  if (subtitle) {
    subtitleEl.textContent = subtitle;
    subtitleEl.style.display = '';
  } else {
    subtitleEl.textContent = '';
    subtitleEl.style.display = 'none';
  }
  bodyEl.innerHTML = '';
  if (footer) {
    footer.remove();
  }
  return {
    wrapper,
    page,
    footer: null,
    sectionTitle: title,
    sectionIndex: -1,
    pageIndex: 0,
    isCover: true,
  };
}

function addWatermark(pageEl, text) {
  const watermark = document.createElement('div');
  watermark.className = 'watermark';
  watermark.textContent = text;
  pageEl.appendChild(watermark);
}

function renderPreview() {
  const { coverTitle, coverSubtitle, sections } = parseInput(textInput.value);
  previewContainer.innerHTML = '';

  const themeValue = themeSelect.value;
  const themeClass = `theme-${themeValue}`;
  const watermarkText = watermarkTextInput.value.trim() || '© PosterLab';

  const pages = [];

  if (coverToggle.checked && coverTitle) {
    const coverPage = createCoverPage(coverTitle, coverSubtitle, themeClass);
    pages.push(coverPage);
    previewContainer.appendChild(coverPage.wrapper);
  }

  sections.forEach((section, index) => {
    const sectionPages = paginateSection(section, index, themeClass);
    sectionPages.forEach((pageData) => {
      pages.push(pageData);
      previewContainer.appendChild(pageData.wrapper);
    });
  });

  if (!pages.length) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-preview';
    emptyMessage.textContent = '请在左侧输入文本以生成页面。';
    previewContainer.appendChild(emptyMessage);
    return;
  }

  pages.forEach((pageData, index) => {
    const { page, footer, sectionTitle, isCover } = pageData;
    if (watermarkToggle.checked && !page.querySelector('.watermark')) {
      addWatermark(page, watermarkText);
    }

    if (!watermarkToggle.checked) {
      const wm = page.querySelector('.watermark');
      if (wm) {
        wm.remove();
      }
    }

    if (pageNumberToggle.checked && footer && !isCover) {
      footer.style.display = 'flex';
      const pageNumber = index + 1;
      const footerLeft = footer.querySelector('.footer-left');
      const footerRight = footer.querySelector('.footer-right');
      if (footerLeft) {
        footerLeft.textContent = sectionTitle || '';
      }
      if (footerRight) {
        footerRight.textContent = `第 ${pageNumber} 页`;
      }
    } else if (footer) {
      footer.style.display = 'none';
    }
  });
}

async function capturePagesForExport() {
  const pages = Array.from(previewContainer.querySelectorAll('.preview-page'));
  if (!pages.length) {
    return [];
  }

  const staging = document.createElement('div');
  staging.style.position = 'fixed';
  staging.style.left = '-99999px';
  staging.style.top = '0';
  staging.style.pointerEvents = 'none';
  staging.style.zIndex = '-1';
  document.body.appendChild(staging);

  const clones = pages.map((page) => {
    const clone = page.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.transformOrigin = 'top left';
    staging.appendChild(clone);
    return clone;
  });

  const results = [];
  for (let i = 0; i < clones.length; i += 1) {
    const canvas = await html2canvas(clones[i], {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
    });
    results.push({
      index: i + 1,
      dataUrl: canvas.toDataURL('image/png'),
    });
  }

  document.body.removeChild(staging);
  return results;
}

async function exportAsPng() {
  exportButton.disabled = true;
  const originalText = exportButton.textContent;
  exportButton.textContent = '生成中...';
  try {
    const captures = await capturePagesForExport();
    captures.forEach((capture) => {
      const link = document.createElement('a');
      link.href = capture.dataUrl;
      link.download = `page-${String(capture.index).padStart(2, '0')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  } catch (error) {
    console.error(error);
    window.alert('导出 PNG 失败，请稍后重试。');
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = originalText;
  }
}

async function downloadAsZip() {
  downloadZipButton.disabled = true;
  const originalText = downloadZipButton.textContent;
  downloadZipButton.textContent = '打包中...';
  try {
    const captures = await capturePagesForExport();
    if (!captures.length) {
      return;
    }
    const zip = new JSZip();
    captures.forEach((capture) => {
      const base64 = capture.dataUrl.split(',')[1];
      zip.file(`page-${String(capture.index).padStart(2, '0')}.png`, base64, {
        base64: true,
      });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `posters-${new Date().getTime()}.zip`);
  } catch (error) {
    console.error(error);
    window.alert('下载 ZIP 失败，请稍后重试。');
  } finally {
    downloadZipButton.disabled = false;
    downloadZipButton.textContent = originalText;
  }
}

function init() {
  textInput.value = DEFAULT_TEXT;
  applyPageSize(pageSizeSelect.value);
  applyFont(fontSelect.value);
  applyBrandColor(brandColorInput.value);
  renderPreview();

  textInput.addEventListener('input', debounce(renderPreview, 200));
  pageSizeSelect.addEventListener('change', (event) => {
    applyPageSize(event.target.value);
    renderPreview();
  });
  themeSelect.addEventListener('change', renderPreview);
  fontSelect.addEventListener('change', (event) => {
    applyFont(event.target.value);
    renderPreview();
  });
  brandColorInput.addEventListener('input', (event) => {
    applyBrandColor(event.target.value);
    renderPreview();
  });
  coverToggle.addEventListener('change', renderPreview);
  watermarkToggle.addEventListener('change', renderPreview);
  pageNumberToggle.addEventListener('change', renderPreview);
  watermarkTextInput.addEventListener('input', debounce(renderPreview, 300));
  refreshButton.addEventListener('click', renderPreview);
  exportButton.addEventListener('click', exportAsPng);
  downloadZipButton.addEventListener('click', downloadAsZip);
}

document.addEventListener('DOMContentLoaded', init);
