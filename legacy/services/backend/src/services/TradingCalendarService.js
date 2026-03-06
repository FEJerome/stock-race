/**
 * [T-014] TradingCalendarService
 * 交易日历服务
 *
 * 职责:
 * - 交易日判断
 * - 下一个交易日计算
 * - 节假日和调休处理
 * - 日历数据导入
 */

const fs = require('fs').promises;
const path = require('path');

class TradingCalendarService {
  constructor(options = {}) {
    this.db = options.db;
    this.calendarData = null;
    this.cache = new Map();
  }

  /**
   * 判断是否为交易日
   * @param {string} date - 日期字符串 (YYYY-MM-DD)
   * @returns {Promise<boolean>}
   */
  async isTradingDay(date) {
    // 检查缓存
    const cached = this.cache.get(`isTrading:${date}`);
    if (cached !== undefined) return cached;

    // 确保日历数据已加载
    await this._ensureCalendarLoaded(date.slice(0, 4));

    const result = this._checkTradingDay(date);
    this.cache.set(`isTrading:${date}`, result);

    return result;
  }

  /**
   * 获取下一个交易日
   * @param {string} date - 起始日期
   * @param {number} n - 第N个交易日（默认1）
   * @returns {Promise<string>} 下一个交易日
   */
  async getNextTradingDay(date, n = 1) {
    let currentDate = new Date(date);
    let tradingDaysFound = 0;

    while (tradingDaysFound < n) {
      currentDate.setDate(currentDate.getDate() + 1);
      const dateStr = this._formatDate(currentDate);

      if (await this.isTradingDay(dateStr)) {
        tradingDaysFound++;
      }
    }

    return this._formatDate(currentDate);
  }

  /**
   * 判断是否为交易时间
   * @param {string} date - 日期
   * @param {string} time - 时间 (HH:mm)
   * @returns {Promise<Object>} { valid, phase, error }
   */
  async isTradingTime(date, time) {
    const isTrading = await this.isTradingDay(date);

    if (!isTrading) {
      return { valid: false, phase: 'closed', error: '非交易日' };
    }

    // 检查是否为半日市
    const halfDay = this.calendarData?.halfDays?.find(h => h.date === date);
    const closeTime = halfDay ? halfDay.closeTime : '15:00';

    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes;
    const closeMinutes = this._timeToMinutes(closeTime);

    // 集合竞价：9:15-9:25
    if (totalMinutes >= 555 && totalMinutes <= 565) {
      return { valid: true, phase: 'auction' };
    }

    // 9:25-9:30 不接受委托
    if (totalMinutes > 565 && totalMinutes < 570) {
      return { valid: false, phase: 'closed', error: '集合竞价结束至开盘前不接受委托' };
    }

    // 上午交易：9:30-11:30
    if (totalMinutes >= 570 && totalMinutes <= 690) {
      return { valid: true, phase: 'continuous' };
    }

    // 午休
    if (totalMinutes > 690 && totalMinutes < 780) {
      return { valid: false, phase: 'closed', error: '午休时间' };
    }

    // 下午交易
    if (totalMinutes >= 780 && totalMinutes <= closeMinutes) {
      return { valid: true, phase: 'continuous' };
    }

    return { valid: false, phase: 'closed', error: '非交易时间' };
  }

  /**
   * 获取某月的所有交易日
   * @param {number} year - 年份
   * @param {number} month - 月份 (1-12)
   * @returns {Promise<Array<string>>} 交易日数组
   */
  async getTradingDaysOfMonth(year, month) {
    await this._ensureCalendarLoaded(year.toString());

    const prefix = `${year}-${month.toString().padStart(2, '0')}`;
    return this.calendarData.tradingDays.filter(d => d.startsWith(prefix));
  }

  /**
   * 加载日历数据
   * @param {number} year - 年份
   */
  async loadCalendar(year) {
    // 尝试从文件加载
    try {
      const fileData = await this.loadCalendarFromFile(year);
      this.calendarData = fileData;
      return fileData;
    } catch (error) {
      console.log(`File calendar not found for ${year}, trying database...`);
    }

    // 从数据库加载
    return await this.loadCalendarFromDB(year);
  }

  /**
   * 从文件加载日历
   * @param {number} year - 年份
   */
  async loadCalendarFromFile(year) {
    const filePath = path.join(__dirname, `../../config/trading-calendar-${year}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }

  /**
   * 从数据库加载日历
   * @param {number} year - 年份
   */
  async loadCalendarFromDB(year) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const result = await this.db.query(
      `SELECT * FROM trading_calendar
       WHERE EXTRACT(YEAR FROM trade_date) = $1
       ORDER BY trade_date`,
      [year]
    );

    const tradingDays = [];
    const holidays = [];
    const halfDays = [];

    for (const row of result.rows) {
      const dateStr = row.trade_date.toISOString().split('T')[0];

      if (row.is_trading_day) {
        tradingDays.push(dateStr);
      } else {
        holidays.push({
          date: dateStr,
          name: row.description || '节假日'
        });
      }

      if (row.is_half_day) {
        halfDays.push({
          date: dateStr,
          closeTime: row.close_time || '12:00'
        });
      }
    }

    return {
      year,
      tradingDays,
      holidays,
      halfDays
    };
  }

  /**
   * 从CSV导入日历
   * @param {string} csvData - CSV数据
   * @param {number} year - 年份
   * @param {Object} options - 选项 { preview: boolean, onDuplicate: string }
   */
  async importCalendarFromCSV(csvData, year, options = {}) {
    const { preview = false, onDuplicate = 'skip' } = options;

    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');

    const records = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const record = {};

      headers.forEach((h, idx) => {
        record[h.trim()] = values[idx]?.trim();
      });

      // 验证日期格式
      if (!this._isValidDate(record.date)) {
        errors.push({ line: i + 1, error: '日期格式无效' });
        continue;
      }

      records.push({
        date: record.date,
        isTradingDay: record.is_trading_day === 'true',
        openTime: record.open_time || '09:30',
        closeTime: record.close_time || '15:00',
        description: record.description || ''
      });
    }

    if (errors.length > 0) {
      throw new Error(`导入数据验证失败: ${JSON.stringify(errors)}`);
    }

    if (preview) {
      return {
        preview: true,
        wouldImport: records.length,
        records: records.slice(0, 5) // 只显示前5条
      };
    }

    // 写入数据库
    if (!preview && this.db) {
      let imported = 0;
      let skipped = 0;

      for (const record of records) {
        try {
          await this.db.query(
            `INSERT INTO trading_calendar
             (trade_date, is_trading_day, open_time, close_time, description, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (trade_date)
             DO UPDATE SET
               is_trading_day = $2,
               open_time = $3,
               close_time = $4,
               description = $5,
               updated_at = NOW()`,
            [
              record.date,
              record.isTradingDay,
              record.openTime,
              record.closeTime,
              record.description
            ]
          );
          imported++;
        } catch (error) {
          if (onDuplicate === 'skip') {
            skipped++;
          } else {
            throw error;
          }
        }
      }

      // 清除缓存
      this.cache.clear();

      return {
        success: true,
        imported,
        skipped,
        total: records.length
      };
    }

    return { success: true, imported: records.length };
  }

  /**
   * 确保日历数据已加载
   * @private
   */
  async _ensureCalendarLoaded(year) {
    if (!this.calendarData || this.calendarData.year !== parseInt(year)) {
      await this.loadCalendar(parseInt(year));
    }
  }

  /**
   * 检查是否为交易日
   * @private
   */
  _checkTradingDay(date) {
    if (!this.calendarData) return false;

    // 直接检查交易日列表
    if (this.calendarData.tradingDays.includes(date)) {
      return true;
    }

    // 检查是否为节假日
    const isHoliday = this.calendarData.holidays.some(h => h.date === date);
    if (isHoliday) {
      return false;
    }

    // 检查是否为周末（周六=6，周日=0）
    const dayOfWeek = new Date(date).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // 检查是否为调休交易日
      return this.calendarData.tradingDays.includes(date);
    }

    // 默认工作日为交易日（如果没有明确标记为节假日）
    return true;
  }

  /**
   * 格式化日期
   * @private
   */
  _formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 时间转分钟数
   * @private
   */
  _timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * 验证日期格式
   * @private
   */
  _isValidDate(dateStr) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;

    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  }
}

export { TradingCalendarService };
export default TradingCalendarService;
