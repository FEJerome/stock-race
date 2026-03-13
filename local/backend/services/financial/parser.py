"""
财报PDF解析器

支持从PDF文件中提取关键财务指标
"""
import re
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# 尝试导入pdfplumber，如不可用则使用PyPDF2作为备选
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False
    try:
        import PyPDF2
        HAS_PYPDF2 = True
    except ImportError:
        HAS_PYPDF2 = False


class FinancialReportParser:
    """
    财报PDF解析器

    从PDF文件中提取关键财务指标：
    - 营业收入
    - 净利润
    - 毛利润/毛利率
    - 每股收益(EPS)
    - 净资产收益率(ROE)
    """

    # 关键指标正则模式 (针对中文财报)
    REVENUE_PATTERNS = [
        r"营业总收入?[\s:：]+([\d,\.]+)",
        r"营业收入[\s:：]+([\d,\.]+)",
        r"其中：营业收入[\s:：]+([\d,\.]+)",
        r"营业总收入（元）[\s:：]+([\d,\.]+)",
    ]

    NET_PROFIT_PATTERNS = [
        r"归属于[^\d]*净利润[\s:：]+([\d,\.]+)",
        r"归属于上市公司股东的净利润[\s:：]+([\d,\.]+)",
        r"净利润[（(]元[）)][\s:：]+([\d,\.]+)",
        r"净利润（元）[\s:：]+([\d,\.]+)",
    ]

    GROSS_PROFIT_PATTERNS = [
        r"毛利润[\s:：]+([\d,\.]+)",
        r"营业利润[\s:：]+([\d,\.]+)",
    ]

    GROSS_MARGIN_PATTERNS = [
        r"毛利率[\s:：]+([\d,\.]+)%?",
        r"销售毛利率[\s:：]+([\d,\.]+)%?",
    ]

    EPS_PATTERNS = [
        r"基本每股收益[\s:：]+([\d,\.]+)",
        r"每股收益[（(]元[/／]股[）)][\s:：]+([\d,\.]+)",
        r"每股收益[\s:：]+([\d,\.]+)",
        r"EPS[\s:：]+([\d,\.]+)",
    ]

    ROE_PATTERNS = [
        r"加权平均净资产收益率[\s:：]+([\d,\.]+)%?",
        r"净资产收益率[\s:：]+([\d,\.]+)%?",
        r"ROE[（(]加权[）)][\s:：]+([\d,\.]+)%?",
    ]

    # 财报类型关键词
    REPORT_TYPE_PATTERNS = {
        'Q1': [r'第一季度', r'一季报', r'Q1', r'1季度', r'一季度'],
        'Q2': [r'半年度', r'半年报', r'中期', r'半年', r'第二季度', r'Q2'],
        'Q3': [r'第三季度', r'三季报', r'Q3', r'3季度', r'三季度'],
        'ANNUAL': [r'年度', r'年报', r'年度报告', r'ANNUAL'],
        'FLASH': [r'业绩快报', r'快报', r'业绩预告'],
    }

    def __init__(self):
        self._check_dependencies()

    def _check_dependencies(self):
        """检查PDF解析依赖"""
        if not HAS_PDFPLUMBER and not HAS_PYPDF2:
            raise ImportError(
                "PDF解析需要 pdfplumber 或 PyPDF2。"
                "请安装: pip install pdfplumber>=0.11.0"
            )

    def parse_pdf(self, pdf_path: str) -> Dict[str, Any]:
        """
        解析PDF文件提取关键指标

        Args:
            pdf_path: PDF文件路径

        Returns:
            解析结果字典，包含关键财务指标
        """
        pdf_path = Path(pdf_path)
        if not pdf_path.exists():
            raise FileNotFoundError(f"PDF文件不存在: {pdf_path}")

        try:
            # 提取所有文本
            full_text = self._extract_text(pdf_path)

            if not full_text:
                logger.warning(f"无法从PDF提取文本: {pdf_path}")
                return self._empty_result()

            # 提取关键指标
            metrics = self.extract_metrics(full_text)

            # 分类财报类型
            report_type = self.classify_report_type(full_text, pdf_path.name)

            # 提取报告期
            report_period = self._extract_report_period(full_text, pdf_path.name)

            return {
                'success': True,
                'metrics': metrics,
                'report_type': report_type,
                'report_period': report_period,
                'raw_text': full_text[:10000],  # 限制文本长度
                'text_length': len(full_text),
            }

        except Exception as e:
            logger.error(f"解析PDF失败 {pdf_path}: {e}")
            return {
                'success': False,
                'error': str(e),
                **self._empty_result()
            }

    def _extract_text(self, pdf_path: Path) -> str:
        """
        从PDF提取全部文本

        优先使用pdfplumber（支持表格），备选PyPDF2
        """
        if HAS_PDFPLUMBER:
            return self._extract_with_pdfplumber(pdf_path)
        elif HAS_PYPDF2:
            return self._extract_with_pypdf2(pdf_path)
        return ""

    def _extract_with_pdfplumber(self, pdf_path: Path) -> str:
        """使用pdfplumber提取文本"""
        text_parts = []

        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                # 提取文本
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

                # 尝试提取表格数据
                tables = page.extract_tables()
                for table in tables:
                    if table:
                        table_text = self._parse_table(table)
                        if table_text:
                            text_parts.append(table_text)

        return '\n'.join(text_parts)

    def _extract_with_pypdf2(self, pdf_path: Path) -> str:
        """使用PyPDF2提取文本（备选方案）"""
        text_parts = []

        with open(pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

        return '\n'.join(text_parts)

    def _parse_table(self, table: List[List]) -> str:
        """解析表格数据为文本"""
        lines = []
        for row in table:
            if row:
                line = ' '.join(str(cell) for cell in row if cell)
                lines.append(line)
        return '\n'.join(lines)

    def extract_metrics(self, text: str) -> Dict[str, Optional[float]]:
        """
        从文本中提取财务指标

        Returns:
            包含以下键的字典:
            - revenue: 营业收入(万元)
            - net_profit: 净利润(万元)
            - gross_profit: 毛利润(万元)
            - gross_margin: 毛利率(%)
            - eps: 每股收益(元)
            - roe: 净资产收益率(%)
        """
        # 预处理文本：移除千分位逗号，统一空格
        clean_text = text.replace(',', '').replace('\xa0', ' ')

        return {
            'revenue': self._extract_number(clean_text, self.REVENUE_PATTERNS),
            'net_profit': self._extract_number(clean_text, self.NET_PROFIT_PATTERNS),
            'gross_profit': self._extract_number(clean_text, self.GROSS_PROFIT_PATTERNS),
            'gross_margin': self._extract_number(clean_text, self.GROSS_MARGIN_PATTERNS),
            'eps': self._extract_number(clean_text, self.EPS_PATTERNS),
            'roe': self._extract_number(clean_text, self.ROE_PATTERNS),
        }

    def _extract_number(self, text: str, patterns: List[str]) -> Optional[float]:
        """
        使用正则模式从文本中提取数字

        Args:
            text: 输入文本
            patterns: 正则模式列表

        Returns:
            提取到的数字，未找到返回None
        """
        for pattern in patterns:
            matches = re.findall(pattern, text)
            if matches:
                try:
                    # 清理数字字符串
                    num_str = matches[0].strip().replace(',', '').replace(' ', '')
                    # 处理可能的单位转换（部分财报以亿元为单位）
                    value = float(num_str)
                    # 如果数值过大，可能是以元为单位，转换为万元
                    if value > 1e8:
                        value = value / 10000
                    return round(value, 2)
                except (ValueError, IndexError):
                    continue
        return None

    def classify_report_type(self, text: str, filename: str = "") -> str:
        """
        分类财报类型

        Returns:
            'Q1' | 'Q2' | 'Q3' | 'ANNUAL' | 'FLASH' | 'UNKNOWN'
        """
        combined_text = text + " " + filename

        for report_type, patterns in self.REPORT_TYPE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, combined_text, re.IGNORECASE):
                    return report_type

        return 'UNKNOWN'

    def _extract_report_period(self, text: str, filename: str = "") -> Optional[str]:
        """
        提取报告期 (如: 2024-Q1, 2024-ANNUAL)

        从文本或文件名中提取报告年度和期间
        """
        combined = text + " " + filename

        # 匹配年份
        year_match = re.search(r'(20\d{2})', combined)
        if not year_match:
            return None

        year = year_match.group(1)
        report_type = self.classify_report_type(text, filename)

        if report_type == 'UNKNOWN':
            return f"{year}"

        return f"{year}-{report_type}"

    def _empty_result(self) -> Dict[str, Any]:
        """返回空结果模板"""
        return {
            'metrics': {
                'revenue': None,
                'net_profit': None,
                'gross_profit': None,
                'gross_margin': None,
                'eps': None,
                'roe': None,
            },
            'report_type': 'UNKNOWN',
            'report_period': None,
            'raw_text': '',
            'text_length': 0,
        }

    def calculate_growth_rates(
        self,
        current: Dict[str, float],
        previous: Optional[Dict[str, float]]
    ) -> Dict[str, Optional[float]]:
        """
        计算同比/环比增长率

        Args:
            current: 当前期数据
            previous: 对比期数据

        Returns:
            增长率字典 (yoy=同比, qoq=环比)
        """
        if not previous:
            return {'yoy': None, 'qoq': None}

        rates = {}
        for metric in ['revenue', 'net_profit']:
            curr_val = current.get(metric)
            prev_val = previous.get(metric)

            if curr_val is not None and prev_val and prev_val != 0:
                rate = ((curr_val - prev_val) / abs(prev_val)) * 100
                rates[metric] = round(rate, 2)
            else:
                rates[metric] = None

        return {
            'revenue_yoy': rates.get('revenue'),
            'revenue_qoq': rates.get('revenue'),
            'net_profit_yoy': rates.get('net_profit'),
            'net_profit_qoq': rates.get('net_profit'),
        }