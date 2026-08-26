# -*- coding: utf-8 -*-
"""v1.3 part1 重跑：store / 表单 / 组件 / 种子 / transfer（修正缩进）"""
import io

def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            raise SystemExit(f'NOT FOUND in {path}: {old[:70]!r}')
        s = s.replace(old, new)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('patched', path)

patch('src/stores/planner.ts', [
    ("priceRange(s.price, s.priceVariance);", "priceRange(s.price, s.varianceUp, s.varianceDown);"),
    ("""    expectedDate?: string | null;
    price?: number | null;
    priceVariance?: number | null;
    expenseType?: 'required' | 'optional';
    note?: string;
  }): [Schedule, FormWarn] {""",
     """    expectedDate?: string | null;
    price?: number | null;
    varianceUp?: number | null;
    varianceDown?: number | null;
    expenseType?: 'required' | 'optional';
    note?: string;
  }): [Schedule, FormWarn] {"""),
    ("""      price: patch.price ?? null,
      priceVariance: patch.priceVariance ?? null,
      expenseType: patch.expenseType ?? 'required',""",
     """      price: patch.price ?? null,
      varianceUp: patch.varianceUp ?? null,
      varianceDown: patch.varianceDown ?? null,
      expenseType: patch.expenseType ?? 'required',"""),
    ("""      expectedDate?: string | null;
      price?: number | null;
      priceVariance?: number | null;
      expenseType?: 'required' | 'optional';
      note?: string;
    },""",
     """      expectedDate?: string | null;
      price?: number | null;
      varianceUp?: number | null;
      varianceDown?: number | null;
      expenseType?: 'required' | 'optional';
      note?: string;
    },"""),
    ("""    s.price = patch.price ?? null;
    s.priceVariance = patch.priceVariance ?? null;
    s.expenseType = patch.expenseType ?? 'required';""",
     """    s.price = patch.price ?? null;
    s.varianceUp = patch.varianceUp ?? null;
    s.varianceDown = patch.varianceDown ?? null;
    s.expenseType = patch.expenseType ?? 'required';"""),
    ("""  /* ---------------- 行程管理 ---------------- */""",
     """  /** 复制日程（库内）：新条目进库未放置；日期/时间/勾选/已付清空，其余字段保留（口径 §17） */
  function duplicateSchedule(id: string): Schedule | null {
    const src = byId(id);
    if (!src || src.deletedAt !== null) return null;
    const now = Date.now();
    const copy: Schedule = {
      ...src,
      id: uid(),
      title: `${src.title} 副本`.slice(0, 30),
      date: null,
      startTime: null,
      confirmed: false,
      paidAmount: null,
      createdAt: now,
      updatedAt: now,
    };
    schedules.value.push(copy);
    persist();
    return copy;
  }

  /* ---------------- 行程管理 ---------------- */"""),
    ("""    // 勾选与已付
    setConfirmed,
    setPaidAmount,""",
     """    // 勾选与已付
    setConfirmed,
    setPaidAmount,
    duplicateSchedule,"""),
])

patch('src/types/form.ts', [
    ("""  price: number | null;
  priceVariance: number | null;
  expenseType: 'required' | 'optional';""",
     """  price: number | null;
  varianceUp: number | null;
  varianceDown: number | null;
  expenseType: 'required' | 'optional';"""),
])

patch('src/components/DetailModal.vue', [
    ("""            <div class="f-row">
              <label>金额波动（元）<span class="hint-inline">正=可能上浮 / 负=可能下浮</span></label>
              <input v-model.number="form.priceVariance" type="number" step="0.01" placeholder="选填，如 500 或 -220" />
            </div>""",
     """            <div class="f-2col">
              <div class="f-row">
                <label>上浮幅度（元）<span class="hint-inline">可能涨价</span></label>
                <input v-model.number="form.varianceUp" type="number" min="0" step="0.01" placeholder="选填，如 500" />
              </div>
              <div class="f-row">
                <label>下浮幅度（元）<span class="hint-inline">可能降价</span></label>
                <input v-model.number="form.varianceDown" type="number" min="0" step="0.01" placeholder="选填，如 220" />
              </div>
            </div>"""),
    ("""  price: null as number | null,
  priceVariance: null as number | null,""",
     """  price: null as number | null,
  varianceUp: null as number | null,
  varianceDown: null as number | null,"""),
    ("""      price: s?.price ?? null,
      priceVariance: s?.priceVariance ?? null,""",
     """      price: s?.price ?? null,
      varianceUp: s?.varianceUp ?? null,
      varianceDown: s?.varianceDown ?? null,"""),
    ("""    priceVariance:
      form.priceVariance === null || Number.isNaN(form.priceVariance) ? null : form.priceVariance,
    expenseType: form.expenseType,""",
     """    varianceUp: form.varianceUp === null || Number.isNaN(form.varianceUp) ? null : Math.max(0, form.varianceUp),
    varianceDown:
      form.varianceDown === null || Number.isNaN(form.varianceDown) ? null : Math.max(0, form.varianceDown),
    expenseType: form.expenseType,"""),
])

patch('src/components/ScheduleCard.vue', [
    ("fmtPriceRange(props.schedule.price, props.schedule.priceVariance)",
     "fmtPriceRange(props.schedule.price, props.schedule.varianceUp, props.schedule.varianceDown)"),
])

patch('src/components/LibraryItem.vue', [
    ("fmtPriceRange(props.schedule.price, props.schedule.priceVariance)",
     "fmtPriceRange(props.schedule.price, props.schedule.varianceUp, props.schedule.varianceDown)"),
    ("if (props.schedule.price == null && props.schedule.priceVariance == null)",
     "if (props.schedule.price == null && props.schedule.varianceUp == null && props.schedule.varianceDown == null)"),
    ("""        <div class="lib-title">{{ schedule.title }}</div>
      </div>""",
     """        <div class="lib-title">{{ schedule.title }}</div>
        <button class="lib-copy" type="button" title="复制日程（进库待排期）" @click.stop="onCopy">⧉</button>
      </div>"""),
    ("""function onPointerDown(e: PointerEvent): void {""",
     """function onCopy(): void {
  const copy = store.duplicateSchedule(props.schedule.id);
  if (copy) toast(`已复制「${copy.title.slice(0, 12)}」到日程库`);
}

function onPointerDown(e: PointerEvent): void {"""),
    ("import { fmtPriceRange } from '@/utils/price';",
     "import { fmtPriceRange } from '@/utils/price';\nimport { toast } from '@/composables/useToast';"),
])

patch('src/data/seed.ts', [
    ("    price: null,\n    priceVariance: null,",
     "    price: null,\n    varianceUp: null,\n    varianceDown: null,"),
    ("date: D0, startTime: '12:30', durationMin: 60, price: 81, priceVariance: 69,",
     "date: D0, startTime: '12:30', durationMin: 60, price: 81, varianceUp: 69,"),
    ("date: D0, startTime: '14:30', durationMin: 180, price: 2553, priceVariance: 500,",
     "date: D0, startTime: '14:30', durationMin: 180, price: 2553, varianceUp: 500,"),
    ("date: D1, startTime: '18:30', durationMin: 60, price: 1200, priceVariance: 300,",
     "date: D1, startTime: '18:30', durationMin: 60, price: 1200, varianceUp: 300,"),
    ("date: D4, startTime: '09:00', durationMin: 120, price: 748, priceVariance: -220,",
     "date: D4, startTime: '09:00', durationMin: 120, price: 748, varianceDown: 220,"),
    ("expectedDate: D3, priceVariance: 500,",
     "expectedDate: D3, varianceUp: 500,"),
])

# ---------- transfer ----------
p = 'src/utils/transfer.ts'
s = io.open(p, encoding='utf-8').read()
s = s.replace("const header = ['行程', '事项名称', '类型', '日期', '开始时间', '结束时间', '时长(分钟)', '地点', '预计日期', '预估价格', '金额波动', '区间下限', '区间上限', '费用类型', '已确认', '已付金额', '状态', '备注'];",
              "const header = ['行程', '事项名称', '类型', '日期', '开始时间', '结束时间', '时长(分钟)', '地点', '预计日期', '预估价格', '下浮', '上浮', '区间下限', '区间上限', '费用类型', '已确认', '已付金额', '状态', '备注'];")
s = s.replace("    const range = priceRange(s.price, s.priceVariance);",
              "    const range = priceRange(s.price, s.varianceUp, s.varianceDown);")
s = s.replace("""      s.price ?? '',
      s.priceVariance ?? '',
      s.price == null && s.priceVariance == null ? '' : range.min,
      s.price == null && s.priceVariance == null ? '' : range.max,""",
"""      s.price ?? '',
      s.varianceDown ?? '',
      s.varianceUp ?? '',
      s.price == null && s.varianceUp == null && s.varianceDown == null ? '' : range.min,
      s.price == null && s.varianceUp == null && s.varianceDown == null ? '' : range.max,""")
s += '''
/**
 * 预算表 CSV（口径 §15）：导出当前筛选下的日程，列与预算页面一致。
 * @param planName 行程名；@param items 已按筛选过滤的日程列表
 */
export function buildBudgetCsv(planName: string, items: Schedule[]): string {
  const header = ['事项名称', '类型', '费用类型', '日期', '开始时间', '结束时间', '地点', '预估价格', '下浮', '上浮', '区间下限', '区间上限', '已付金额', '确认状态', '状态', '备注'];
  const rows = items.map((s) => {
    const range = priceRange(s.price, s.varianceUp, s.varianceDown);
    const end = s.startTime ? minToHH(Number(s.startTime.slice(0, 2)) * 60 + Number(s.startTime.slice(3)) + s.durationMin) : '';
    const hasPrice = s.price != null || s.varianceUp != null || s.varianceDown != null;
    return [
      s.title,
      TYPE_MAP[s.type].name,
      s.expenseType === 'optional' ? '可选' : '必须',
      s.date ?? '',
      s.startTime ?? '',
      end,
      s.location,
      s.price ?? '',
      s.varianceDown ?? '',
      s.varianceUp ?? '',
      hasPrice ? range.min : '',
      hasPrice ? range.max : '',
      s.paidAmount ?? '',
      s.confirmed ? '已确认' : '未确认',
      s.date ? '已放置' : '未放置',
      s.note,
    ].map(csvCell).join(',');
  });
  return '\\uFEFF' + [`预算表: ${csvCell(planName)}`, '', header.map(csvCell).join(','), ...rows].join('\\r\\n');
}
'''
io.open(p, 'w', encoding='utf-8').write(s)
print('patched transfer.ts')
