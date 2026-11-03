import {
  detectDocumentType,
  formatDocument,
  formatPhone,
  isValidCNPJ,
  isValidCPF,
  isValidPhone,
} from '@/lib/documents';

describe('CPF', () => {
  it('valida CPFs corretos e rejeita inválidos', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('52998224725')).toBe(true);
    expect(isValidCPF('529.982.247-24')).toBe(false);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF('123')).toBe(false);
  });
});

describe('CNPJ', () => {
  it('valida CNPJs corretos e rejeita inválidos', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11222333000181')).toBe(true);
    expect(isValidCNPJ('11.222.333/0001-80')).toBe(false);
    expect(isValidCNPJ('00000000000000')).toBe(false);
  });
});

describe('formatação', () => {
  it('detecta e formata documentos', () => {
    expect(detectDocumentType('52998224725')).toBe('cpf');
    expect(detectDocumentType('11222333000181')).toBe('cnpj');
    expect(detectDocumentType('123')).toBeNull();
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('formata e valida telefones', () => {
    expect(formatPhone('11988887777')).toBe('(11) 98888-7777');
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444');
    expect(isValidPhone('(11) 98888-7777')).toBe(true);
    expect(isValidPhone('5511988887777')).toBe(true);
    expect(isValidPhone('98888-7777')).toBe(false);
  });
});
