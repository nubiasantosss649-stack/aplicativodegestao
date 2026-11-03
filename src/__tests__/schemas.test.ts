import {
  businessSchema,
  financialEntrySchema,
  productSchema,
  signUpSchema,
  stockMovementSchema,
} from '@/features/schemas';

describe('schemas de formulário', () => {
  it('valida cadastro com senha forte e termos aceitos', () => {
    const base = { fullName: 'Maria', email: 'maria@teste.com', password: 'senha123', confirmPassword: 'senha123', acceptTerms: true };
    expect(signUpSchema.safeParse(base).success).toBe(true);
    expect(signUpSchema.safeParse({ ...base, password: 'curta', confirmPassword: 'curta' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, confirmPassword: 'outra123' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
  });

  it('aceita negócio sem CPF/CNPJ e valida quando informado', () => {
    const base = { name: 'Salão Bela', businessType: 'beauty', document: '', phone: '' };
    expect(businessSchema.safeParse(base).success).toBe(true);
    expect(businessSchema.safeParse({ ...base, document: '529.982.247-25' }).success).toBe(true);
    expect(businessSchema.safeParse({ ...base, document: '11.222.333/0001-81' }).success).toBe(true);
    expect(businessSchema.safeParse({ ...base, document: '123.456.789-00' }).success).toBe(false);
  });

  it('exige preço de venda válido no produto', () => {
    const base = {
      name: 'Arroz', categoryId: null, description: '', internalCode: '', barcode: '', unit: 'un',
      cost: '18,00', price: '25,00', initialStock: '10', minStock: '2', trackStock: true,
    };
    expect(productSchema.safeParse(base).success).toBe(true);
    expect(productSchema.safeParse({ ...base, price: '' }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, initialStock: '-1' }).success).toBe(false);
  });

  it('exige justificativa em ajuste de estoque', () => {
    const base = { type: 'adjustment' as const, direction: 'out' as const, quantity: '1', unitCost: '', reason: '', updateCost: false };
    expect(stockMovementSchema.safeParse(base).success).toBe(false);
    expect(stockMovementSchema.safeParse({ ...base, reason: 'Produto vencido' }).success).toBe(true);
  });

  it('exige vencimento para conta a pagar', () => {
    const base = {
      kind: 'expense' as const, description: 'Aluguel', amount: '1.200,00', categoryId: null,
      competenceDate: '', dueDate: '', paid: false, method: null, notes: '',
    };
    expect(financialEntrySchema.safeParse(base).success).toBe(false);
    expect(financialEntrySchema.safeParse({ ...base, dueDate: '10/11/2026' }).success).toBe(true);
    expect(financialEntrySchema.safeParse({ ...base, paid: true, method: 'pix' }).success).toBe(true);
  });
});
