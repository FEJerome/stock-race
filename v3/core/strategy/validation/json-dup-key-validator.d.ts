declare module "json-dup-key-validator" {
  const validator: {
    validate(input: string, allowDuplicatedKeys?: boolean): string | undefined;
  };
  export default validator;
}
